const express = require('express');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const {
  calcEDD,
  calcGestationalAgeWeeks,
  scoreRegistrationRisk,
} = require('../services/riskEngine');
const { insertAlert } = require('../services/clinicalAudit');
const { assertPregnancyAccess } = require('../utils/scope');

const router = express.Router();

async function persistAlerts(conn, pregnancyId, facilityId, userId, alerts) {
  for (const a of alerts) {
    await insertAlert(conn, { pregnancyId, facilityId, userId, alert: a });
  }
}

async function findDuplicateMother(conn, { national_id, phone, anc_number, mother_id }) {
  if (mother_id) return null;
  const clauses = [];
  const params = [];
  if (national_id) {
    clauses.push('m.national_id = ?');
    params.push(national_id);
  }
  if (phone) {
    clauses.push('m.phone = ?');
    params.push(phone);
  }
  if (anc_number) {
    clauses.push('p.anc_number = ?');
    params.push(anc_number);
  }
  if (!clauses.length) return null;

  const [rows] = await conn.execute(
    `SELECT m.id AS mother_id, m.full_name, p.id AS pregnancy_id, p.anc_number, p.status
     FROM mothers m
     INNER JOIN pregnancies p ON p.mother_id = m.id
       AND p.id = (
         SELECT MAX(p2.id) FROM pregnancies p2
         WHERE p2.mother_id = m.id AND p2.status IN ('anc','labor','postpartum','referred')
       )
     WHERE (${clauses.join(' OR ')})
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

router.post('/', authenticate, authorize('midwife', 'doctor', 'chw'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const body = req.body;
    if (!body.full_name || !body.date_of_birth) {
      return res.status(400).json({ error: 'full_name and date_of_birth required' });
    }
    if (!body.lmp && !body.edd) {
      return res.status(400).json({
        error: 'Required clinical information incomplete.',
        missing: ['LMP or EDD (current pregnancy information)'],
      });
    }

    await conn.beginTransaction();

    const dup = await findDuplicateMother(conn, {
      national_id: body.national_id,
      phone: body.phone,
      anc_number: body.anc_number,
      mother_id: body.mother_id,
    });
    if (dup) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Mother already registered. Open existing maternal profile.',
        duplicate: true,
        mother_id: dup.mother_id,
        pregnancy_id: dup.pregnancy_id,
        anc_number: dup.anc_number,
        full_name: dup.full_name,
      });
    }

    let motherId = body.mother_id;
    if (!motherId) {
      const [result] = await conn.execute(
        `INSERT INTO mothers (national_id, full_name, date_of_birth, phone, village, cell_name, sector, district,
          insurance, emergency_contact_name, emergency_contact_phone, blood_group)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          body.national_id || null,
          body.full_name,
          body.date_of_birth,
          body.phone || null,
          body.village || null,
          body.cell_name || null,
          body.sector || null,
          body.district || null,
          body.insurance || null,
          body.emergency_contact_name || null,
          body.emergency_contact_phone || null,
          body.blood_group || null,
        ]
      );
      motherId = result.insertId;
    }

    const lmp = body.lmp || null;
    const edd = lmp ? calcEDD(lmp) : body.edd || null;
    const ga = lmp ? calcGestationalAgeWeeks(lmp) : body.gestational_age_weeks || null;

    const obstetric = body.obstetric || {};
    const medical = body.medical || {};
    const scored = scoreRegistrationRisk({
      obstetric,
      medical,
      gravida: body.gravida || 1,
      para: body.para || 0,
      abortions: body.abortions || 0,
      date_of_birth: body.date_of_birth,
      multiple_pregnancy: body.multiple_pregnancy,
    });

    const year = new Date().getFullYear();
    const [countRows] = await conn.execute(
      "SELECT COUNT(*) AS c FROM pregnancies WHERE strftime('%Y',registered_at) = ?",
      [String(year)]
    );
    const ancNumber = body.anc_number || `ANC-${year}-${String(countRows[0].c + 1).padStart(4, '0')}`;

    const facilityId = req.user.facility_id;
    if (!facilityId) {
      await conn.rollback();
      return res.status(400).json({ error: 'User must belong to a facility' });
    }

    const [pregResult] = await conn.execute(
      `INSERT INTO pregnancies (mother_id, facility_id, anc_number, lmp, edd, gestational_age_weeks,
        gravida, para, abortions, multiple_pregnancy, hiv_status, risk_score, risk_percent, status, registered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'anc', ?)`,
      [
        motherId,
        facilityId,
        ancNumber,
        lmp,
        edd,
        ga,
        body.gravida || 1,
        body.para || 0,
        body.abortions || 0,
        body.multiple_pregnancy ? 1 : 0,
        medical.hiv ? 'positive' : body.hiv_status || 'unknown',
        scored.risk_score,
        scored.risk_percent,
        req.user.id,
      ]
    );
    const pregnancyId = pregResult.insertId;

    await conn.execute(
      `INSERT INTO obstetric_history (pregnancy_id, previous_stillbirth, previous_csection, previous_pph,
        previous_eclampsia, previous_premature, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        pregnancyId,
        obstetric.previous_stillbirth ? 1 : 0,
        obstetric.previous_csection ? 1 : 0,
        obstetric.previous_pph ? 1 : 0,
        obstetric.previous_eclampsia ? 1 : 0,
        obstetric.previous_premature ? 1 : 0,
        obstetric.notes || null,
      ]
    );

    await conn.execute(
      `INSERT INTO medical_history (pregnancy_id, hypertension, diabetes, hiv, tb, asthma, epilepsy, sickle_cell, allergies)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pregnancyId,
        medical.hypertension ? 1 : 0,
        medical.diabetes ? 1 : 0,
        medical.hiv ? 1 : 0,
        medical.tb ? 1 : 0,
        medical.asthma ? 1 : 0,
        medical.epilepsy ? 1 : 0,
        medical.sickle_cell ? 1 : 0,
        medical.allergies || null,
      ]
    );

    await persistAlerts(conn, pregnancyId, facilityId, req.user.id, scored.alerts);
    await conn.commit();

    await audit(req.user.id, facilityId, 'register_pregnancy', 'pregnancy', pregnancyId, { ancNumber }, req.ip);

    res.status(201).json({
      pregnancy_id: pregnancyId,
      mother_id: motherId,
      anc_number: ancNumber,
      edd,
      gestational_age_weeks: ga,
      risk_score: scored.risk_score,
      risk_percent: scored.risk_percent,
      alerts: scored.alerts,
      ai_disclaimer: scored.ai_disclaimer,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(409).json({
        error: 'Mother already registered. Open existing maternal profile.',
        duplicate: true,
      });
    }
    res.status(500).json({ error: 'Registration failed', detail: e.message });
  } finally {
    conn.release();
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const access = await assertPregnancyAccess(pool, req.user, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const [rows] = await pool.execute(
      `SELECT p.*, m.full_name, m.date_of_birth, m.national_id, m.phone, m.village, m.cell_name,
              m.sector, m.district, m.insurance, m.blood_group, m.emergency_contact_name, m.emergency_contact_phone,
              (strftime('%Y','now') - strftime('%Y',m.date_of_birth)) AS age,
              f.name AS facility_name, f.district AS facility_district
       FROM pregnancies p
       JOIN mothers m ON m.id = p.mother_id
       JOIN facilities f ON f.id = p.facility_id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pregnancy not found' });

    const pregnancy = rows[0];
    const [[obstetric]] = await pool.execute('SELECT * FROM obstetric_history WHERE pregnancy_id = ?', [req.params.id]);
    const [[medical]] = await pool.execute('SELECT * FROM medical_history WHERE pregnancy_id = ?', [req.params.id]);
    const [visits] = await pool.execute(
      `SELECT av.*, v.bp_systolic, v.bp_diastolic, v.weight_kg, v.fetal_heart_rate, v.temperature, v.pulse,
              l.hemoglobin, l.urine_protein, l.hiv_result,
              t.iron, t.folate, t.vaccination, t.malaria_prevention, t.deworming
       FROM anc_visits av
       LEFT JOIN anc_vitals v ON v.anc_visit_id = av.id
       LEFT JOIN anc_labs l ON l.anc_visit_id = av.id
       LEFT JOIN treatments t ON t.anc_visit_id = av.id
       WHERE av.pregnancy_id = ? ORDER BY av.visit_number`,
      [req.params.id]
    );
    const [alerts] = await pool.execute(
      `SELECT * FROM alerts WHERE pregnancy_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );
    const [referrals] = await pool.execute(
      `SELECT * FROM referrals WHERE pregnancy_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );
    const [[labor]] = await pool.execute('SELECT * FROM labor_admissions WHERE pregnancy_id = ?', [req.params.id]);
    const [[delivery]] = await pool.execute('SELECT * FROM deliveries WHERE pregnancy_id = ?', [req.params.id]);
    const [postpartum] = await pool.execute(
      `SELECT * FROM postpartum_assessments WHERE pregnancy_id = ? ORDER BY assessed_at`,
      [req.params.id]
    );
    const [emergencies] = await pool.execute(
      `SELECT id, emergency_type, status, activated_at, outcome
       FROM emergencies WHERE pregnancy_id = ? ORDER BY activated_at DESC LIMIT 10`,
      [req.params.id]
    );
    let lab_results = [];
    let ultrasound_results = [];
    try {
      const [labs] = await pool.execute(
        `SELECT lr.*, u.full_name AS recorded_by_name
         FROM lab_results lr
         LEFT JOIN users u ON u.id = lr.recorded_by
         WHERE lr.pregnancy_id = ?
         ORDER BY lr.test_date DESC LIMIT 20`,
        [req.params.id]
      );
      lab_results = labs.map((r) => ({
        ...r,
        abnormal_flags: typeof r.abnormal_flags === 'string' ? JSON.parse(r.abnormal_flags || '[]') : (r.abnormal_flags || []),
      }));
      const [usRows] = await pool.execute(
        `SELECT us.*, u.full_name AS recorded_by_name
         FROM ultrasound_results us
         LEFT JOIN users u ON u.id = us.recorded_by
         WHERE us.pregnancy_id = ?
         ORDER BY us.exam_date DESC LIMIT 20`,
        [req.params.id]
      );
      ultrasound_results = usRows.map((r) => ({
        ...r,
        abnormal_flags: typeof r.abnormal_flags === 'string' ? JSON.parse(r.abnormal_flags || '[]') : (r.abnormal_flags || []),
      }));
    } catch (_invErr) {
      // tables may not exist yet
    }

    if (pregnancy.lmp) {
      pregnancy.gestational_age_weeks = calcGestationalAgeWeeks(pregnancy.lmp);
    }

    const activeAlerts = alerts.filter((a) => a.status === 'active');
    res.json({
      pregnancy,
      obstetric: obstetric || null,
      medical: medical || null,
      anc_visits: visits,
      lab_results,
      ultrasound_results,
      alerts,
      referrals,
      labor: labor || null,
      delivery: delivery || null,
      postpartum,
      emergencies,
      timeline: buildTimeline(pregnancy, visits, labor, delivery, postpartum),
      next_actions: suggestNextActions(pregnancy, labor, delivery, activeAlerts),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load pregnancy record' });
  }
});

function buildTimeline(pregnancy, visits, labor, delivery, postpartum) {
  const items = visits.map((v) => ({
    type: 'anc',
    label: `ANC Visit ${v.visit_number}`,
    date: v.visit_date,
    status: 'completed',
    id: v.id,
  }));
  items.push({
    type: 'labor',
    label: 'Labor',
    date: labor?.admission_time || null,
    status: labor ? 'completed' : pregnancy.status === 'labor' ? 'active' : 'pending',
    id: labor?.id || null,
  });
  items.push({
    type: 'delivery',
    label: 'Delivery',
    date: delivery?.delivery_time || null,
    status: delivery ? 'completed' : 'pending',
    id: delivery?.id || null,
  });
  items.push({
    type: 'postpartum',
    label: 'Postpartum',
    date: postpartum?.[0]?.assessed_at || null,
    status: pregnancy.status === 'postpartum' || postpartum?.length ? 'active' : 'pending',
    count: postpartum?.length || 0,
  });
  return items;
}

function suggestNextActions(pregnancy, labor, delivery, activeAlerts = []) {
  const actions = [];
  const hasCritical = activeAlerts.some((a) => a.severity === 'CRITICAL');

  if (hasCritical) {
    actions.push({ action: 'emergency', label: 'Emergency Mode' });
    actions.push({ action: 'refer', label: 'Refer Patient' });
  }

  if (pregnancy.status === 'anc') {
    actions.push({ action: 'start_anc', label: 'Start ANC Visit' });
    actions.push({ action: 'admit_labor', label: 'Admit Labor' });
    if (!hasCritical) actions.push({ action: 'refer', label: 'Refer Patient' });
    if (!hasCritical) actions.push({ action: 'emergency', label: 'Emergency Mode' });
  } else if (pregnancy.status === 'labor') {
    actions.push({ action: 'partograph', label: 'Open Partograph' });
    actions.push({ action: 'delivery', label: 'Prepare Delivery' });
    if (!hasCritical) actions.push({ action: 'emergency', label: 'Emergency Mode' });
    if (!hasCritical) actions.push({ action: 'refer', label: 'Refer Patient' });
  } else if (pregnancy.status === 'postpartum' || delivery) {
    actions.push({ action: 'postpartum', label: 'Postpartum Assessment' });
    if (!hasCritical) actions.push({ action: 'emergency', label: 'Emergency Mode' });
    actions.push({ action: 'view_history', label: 'View ANC History' });
  } else if (pregnancy.status === 'referred') {
    actions.push({ action: 'view_history', label: 'View ANC History' });
    actions.push({ action: 'postpartum', label: 'Postpartum Assessment' });
  } else {
    actions.push({ action: 'view_history', label: 'View ANC History' });
  }

  // de-dupe by action
  const seen = new Set();
  return actions.filter((a) => {
    if (seen.has(a.action)) return false;
    seen.add(a.action);
    return true;
  });
}

/** Rule 7.1 — Referral must include reason, clinical summary, vitals, treatment, provider */
router.post('/:id/refer', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  try {
    const access = await assertPregnancyAccess(pool, req.user, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const {
      to_facility_name,
      reason,
      urgency,
      clinical_summary,
      vital_signs,
      treatment_provided,
    } = req.body;

    const missing = [];
    if (!reason) missing.push('Reason');
    if (!clinical_summary) missing.push('Clinical summary');
    if (!vital_signs) missing.push('Vital signs');
    if (!treatment_provided) missing.push('Treatment provided');
    if (missing.length) {
      return res.status(400).json({
        error: 'Required clinical information incomplete.',
        missing,
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO referrals (pregnancy_id, from_facility_id, to_facility_name, reason, clinical_summary,
        vital_signs, treatment_provided, urgency, requested_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.params.id,
        req.user.facility_id,
        to_facility_name || 'District Hospital',
        reason,
        clinical_summary,
        typeof vital_signs === 'string' ? vital_signs : JSON.stringify(vital_signs),
        treatment_provided,
        urgency || 'urgent',
        req.user.id,
      ]
    );
    await pool.execute(`UPDATE pregnancies SET status = 'referred' WHERE id = ?`, [req.params.id]);
    await audit(req.user.id, req.user.facility_id, 'referral', 'referral', result.insertId, { reason }, req.ip);
    res.status(201).json({
      referral_id: result.insertId,
      tracking: ['pending', 'accepted', 'transferred', 'received', 'completed'],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Referral failed', detail: e.message });
  }
});

/** Rule 7.2 — Referral tracking; Rule 1.1 — only doctor approves */
router.patch('/referrals/:referralId', authenticate, authorize('doctor'), async (req, res) => {
  try {
    const { status, clinical_recommendation } = req.body;
    const allowed = ['pending', 'accepted', 'transferred', 'received', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid referral status' });
    }
    await pool.execute(
      `UPDATE referrals SET status = ?, approved_by = ? WHERE id = ?`,
      [status, req.user.id, req.params.referralId]
    );
    if (clinical_recommendation) {
      const [[ref]] = await pool.execute('SELECT pregnancy_id, from_facility_id FROM referrals WHERE id = ?', [req.params.referralId]);
      if (ref) {
        await insertAlert(null, {
          pregnancyId: ref.pregnancy_id,
          facilityId: ref.from_facility_id,
          userId: req.user.id,
          alert: {
            alert_type: 'clinical_decision',
            severity: 'HIGH',
            title: 'Doctor clinical recommendation',
            message: clinical_recommendation,
            recommended_actions: ['Follow doctor recommendation', 'Update care plan'],
            explanation: 'Doctor decision recorded. Midwives cannot override doctor decisions.',
            requires_human_confirmation: false,
            ai_decision_support: false,
          },
        });
      }
    }
    await audit(req.user.id, req.user.facility_id, 'referral_decision', 'referral', Number(req.params.referralId), { status }, req.ip);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Referral update failed' });
  }
});

/** Rule 9.1 — AI recommendations require human confirmation */
router.patch('/alerts/:alertId/ack', authenticate, authorize('doctor', 'midwife'), async (req, res) => {
  try {
    const [[alert]] = await pool.execute('SELECT * FROM alerts WHERE id = ?', [req.params.alertId]);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    // Midwives cannot change/override doctor clinical decisions
    if (req.user.role === 'midwife' && alert.alert_type === 'clinical_decision') {
      return res.status(403).json({ error: 'Midwives cannot change doctor decisions' });
    }

    const confirmationNote = req.body.confirmation_note || 'Clinician confirmed AI recommendation';
    await pool.execute(
      `UPDATE alerts SET status = 'acknowledged' WHERE id = ?`,
      [req.params.alertId]
    );
    await audit(
      req.user.id,
      req.user.facility_id,
      'ack_alert',
      'alert',
      Number(req.params.alertId),
      { confirmation_note: confirmationNote, human_confirmed: true },
      req.ip
    );
    res.json({
      ok: true,
      human_confirmed: true,
      disclaimer: 'AI recommendation confirmed by clinician. AI does not replace clinical judgment.',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

router.delete('/:id', authenticate, (_req, res) => {
  res.status(403).json({
    error: 'Clinical records cannot be permanently deleted. Use corrections with audit trail.',
  });
});

module.exports = router;
