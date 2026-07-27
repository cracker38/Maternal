const express = require('express');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const {
  evaluateAncVisit,
  maxSeverity,
  validateAncVisitMandatory,
  calcGestationalAgeWeeks,
} = require('../services/riskEngine');
const { insertAlert } = require('../services/clinicalAudit');
const { assertPregnancyAccess } = require('../utils/scope');

const router = express.Router();

router.post('/', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      pregnancy_id,
      vitals = {},
      labs = {},
      danger = {},
      treatment = {},
      counseling = {},
      notes,
    } = req.body;
    if (!pregnancy_id) return res.status(400).json({ error: 'pregnancy_id required' });

    const access = await assertPregnancyAccess(pool, req.user, pregnancy_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const validation = validateAncVisitMandatory({
      vitals,
      danger,
      danger_assessment_done: true,
      ga_confirmed: true,
    });
    if (!validation.ok) {
      return res.status(400).json({
        error: validation.error,
        missing: validation.missing,
      });
    }

    await conn.beginTransaction();

    const [[preg]] = await conn.execute(
      `SELECT p.*, oh.previous_csection, oh.previous_pph, oh.previous_eclampsia, oh.previous_stillbirth, oh.previous_premature
       FROM pregnancies p
       LEFT JOIN obstetric_history oh ON oh.pregnancy_id = p.id
       WHERE p.id = ?`,
      [pregnancy_id]
    );
    if (!preg) {
      await conn.rollback();
      return res.status(404).json({ error: 'Pregnancy not found' });
    }

    if (!preg.gestational_age_weeks && !preg.lmp) {
      await conn.rollback();
      return res.status(400).json({
        error: 'Required clinical information incomplete.',
        missing: ['Gestational age'],
      });
    }

    const [[vn]] = await conn.execute(
      'SELECT COALESCE(MAX(visit_number), 0) + 1 AS next_n FROM anc_visits WHERE pregnancy_id = ?',
      [pregnancy_id]
    );

    const gaForEval = preg.lmp
      ? calcGestationalAgeWeeks(preg.lmp)
      : preg.gestational_age_weeks;

    const evaluation = evaluateAncVisit({
      vitals: { ...vitals, gestational_age_weeks: gaForEval },
      labs,
      danger,
      obstetric: {
        previous_csection: preg.previous_csection,
        previous_pph: preg.previous_pph,
        previous_eclampsia: preg.previous_eclampsia,
      },
    });

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + evaluation.next_visit_days);

    const [visitResult] = await conn.execute(
      `INSERT INTO anc_visits (pregnancy_id, visit_number, visit_date, facility_id, conducted_by, next_visit_date,
        counseling_nutrition, counseling_birth_prep, counseling_danger_signs, notes)
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
      [
        pregnancy_id,
        vn.next_n,
        req.user.facility_id,
        req.user.id,
        nextDate.toISOString().slice(0, 10),
        counseling.nutrition ? 1 : 0,
        counseling.birth_prep ? 1 : 0,
        counseling.danger_signs ? 1 : 0,
        notes || null,
      ]
    );
    const visitId = visitResult.insertId;

    await conn.execute(
      `INSERT INTO anc_vitals (anc_visit_id, bp_systolic, bp_diastolic, temperature, pulse, weight_kg,
        fundal_height_cm, fetal_heart_rate, fetal_movement, presentation, edema)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        visitId,
        vitals.bp_systolic || null,
        vitals.bp_diastolic || null,
        vitals.temperature || null,
        vitals.pulse || null,
        vitals.weight_kg || null,
        vitals.fundal_height_cm || null,
        vitals.fetal_heart_rate || null,
        vitals.fetal_movement || 'normal',
        vitals.presentation || null,
        vitals.edema || 'none',
      ]
    );

    await conn.execute(
      `INSERT INTO anc_labs (anc_visit_id, hemoglobin, hiv_result, urine_protein, glucose, syphilis)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        visitId,
        labs.hemoglobin ?? null,
        labs.hiv_result || 'not_done',
        labs.urine_protein || 'negative',
        labs.glucose || 'negative',
        labs.syphilis || 'not_done',
      ]
    );

    await conn.execute(
      `INSERT INTO danger_signs (anc_visit_id, headache, blurred_vision, bleeding, convulsion, reduced_fetal_movement, severe_pain)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        visitId,
        danger.headache ? 1 : 0,
        danger.blurred_vision ? 1 : 0,
        danger.bleeding ? 1 : 0,
        danger.convulsion ? 1 : 0,
        danger.reduced_fetal_movement ? 1 : 0,
        danger.severe_pain ? 1 : 0,
      ]
    );

    await conn.execute(
      `INSERT INTO treatments (anc_visit_id, iron, folate, vaccination, malaria_prevention, deworming)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        visitId,
        treatment.iron ? 1 : 0,
        treatment.folate ? 1 : 0,
        treatment.vaccination ? 1 : 0,
        treatment.malaria_prevention ? 1 : 0,
        treatment.deworming ? 1 : 0,
      ]
    );

    const newRisk = maxSeverity(preg.risk_score, evaluation.risk_score);
    const ga = preg.lmp ? calcGestationalAgeWeeks(preg.lmp) : preg.gestational_age_weeks;
    await conn.execute(
      `UPDATE pregnancies SET risk_score = ?, risk_percent = GREATEST(COALESCE(risk_percent,0), ?),
        gestational_age_weeks = COALESCE(?, gestational_age_weeks),
        hiv_status = IF(? = 'positive', 'positive', hiv_status) WHERE id = ?`,
      [newRisk, evaluation.risk_percent, ga, labs.hiv_result || 'not_done', pregnancy_id]
    );

    for (const a of evaluation.alerts) {
      await insertAlert(conn, {
        pregnancyId: pregnancy_id,
        facilityId: req.user.facility_id,
        userId: req.user.id,
        alert: a,
      });
    }

    // Rule 3.1 — SMS reminder stub + maternal timeline update via next_visit_date
    await audit(
      req.user.id,
      req.user.facility_id,
      'anc_sms_reminder',
      'anc_visit',
      visitId,
      { channel: 'sms_stub', next_visit_date: nextDate.toISOString().slice(0, 10), template: evaluation.sms_stub?.template },
      req.ip
    );

    if (evaluation.risk_score === 'HIGH' || evaluation.risk_score === 'CRITICAL') {
      await conn.execute(
        `INSERT INTO followup_tasks (pregnancy_id, facility_id, task_type, title, due_date, status, notes)
         VALUES (?, ?, 'reminder', ?, ?, 'pending', ?)`,
        [
          pregnancy_id,
          req.user.facility_id,
          `High-risk ANC follow-up (Visit ${vn.next_n})`,
          nextDate.toISOString().slice(0, 10),
          'Auto-created by maternal risk engine — requires human confirmation of AI alerts',
        ]
      );
    }

    await conn.commit();
    await audit(req.user.id, req.user.facility_id, 'anc_visit', 'anc_visit', visitId, { risk: newRisk }, req.ip);

    res.status(201).json({
      visit_id: visitId,
      visit_number: vn.next_n,
      risk_score: newRisk,
      risk_percent: evaluation.risk_percent,
      alerts: evaluation.alerts,
      next_visit_date: nextDate.toISOString().slice(0, 10),
      sms_stub: evaluation.sms_stub,
      followup_created: evaluation.risk_score === 'HIGH' || evaluation.risk_score === 'CRITICAL',
      ai_disclaimer: evaluation.ai_disclaimer,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'ANC visit save failed', detail: e.message });
  } finally {
    conn.release();
  }
});

/**
 * Rule 3.5 — Missed ANC automation:
 * mark missed, notify midwife (alert), assign CHW, send reminder stub
 */
router.post('/process-missed', authenticate, authorize('midwife', 'doctor', 'facility_admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const facilityId = req.user.facility_id;
    if (!facilityId) {
      await conn.rollback();
      return res.status(400).json({ error: 'Facility required' });
    }

    const [overdue] = await conn.execute(
      `SELECT av.pregnancy_id, av.next_visit_date, p.anc_number, m.full_name, m.phone, p.facility_id
       FROM anc_visits av
       JOIN pregnancies p ON p.id = av.pregnancy_id
       JOIN mothers m ON m.id = p.mother_id
       WHERE p.facility_id = ?
         AND p.status = 'anc'
         AND av.next_visit_date < CURDATE()
         AND av.id = (SELECT MAX(av2.id) FROM anc_visits av2 WHERE av2.pregnancy_id = av.pregnancy_id)
         AND NOT EXISTS (
           SELECT 1 FROM followup_tasks ft
           WHERE ft.pregnancy_id = av.pregnancy_id
             AND ft.task_type = 'missed_anc'
             AND ft.status IN ('pending', 'in_progress')
         )`,
      [facilityId]
    );

    const [[chw]] = await conn.execute(
      `SELECT id FROM users WHERE facility_id = ? AND role = 'chw' AND is_active = 1 LIMIT 1`,
      [facilityId]
    );

    const created = [];
    for (const row of overdue) {
      const [task] = await conn.execute(
        `INSERT INTO followup_tasks (pregnancy_id, facility_id, assigned_to, task_type, title, due_date, status, notes)
         VALUES (?, ?, ?, 'missed_anc', ?, CURDATE(), 'pending', ?)`,
        [
          row.pregnancy_id,
          facilityId,
          chw?.id || null,
          `Missed ANC — ${row.full_name}`,
          `Overdue since ${row.next_visit_date}. CHW home visit assigned.`,
        ]
      );

      await insertAlert(conn, {
        pregnancyId: row.pregnancy_id,
        facilityId,
        userId: req.user.id,
        alert: {
          alert_type: 'missed_anc',
          severity: 'MEDIUM',
          title: 'Missed ANC visit',
          message: `${row.full_name} (${row.anc_number}) missed scheduled ANC on ${row.next_visit_date}.`,
          recommended_actions: ['Notify midwife', 'CHW follow-up', 'Send reminder message'],
          explanation: 'Rule 3.5: Missed ANC triggers midwife notification, CHW assignment, and reminder.',
        },
      });

      await audit(
        req.user.id,
        facilityId,
        'missed_anc_reminder',
        'followup_task',
        task.insertId,
        {
          channel: 'sms_stub',
          phone: row.phone,
          template: `RMDP: You missed your ANC visit. Please contact ${row.anc_number ? 'your facility' : 'your clinic'} soon.`,
        },
        req.ip
      );

      created.push({ pregnancy_id: row.pregnancy_id, task_id: task.insertId });
    }

    await conn.commit();
    res.json({ processed: created.length, tasks: created });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Missed ANC processing failed', detail: e.message });
  } finally {
    conn.release();
  }
});

router.get('/pregnancy/:pregnancyId', authenticate, async (req, res) => {
  try {
    const [visits] = await pool.execute(
      `SELECT av.*,
        v.bp_systolic, v.bp_diastolic, v.temperature, v.pulse, v.weight_kg, v.fundal_height_cm,
        v.fetal_heart_rate, v.fetal_movement, v.presentation, v.edema,
        l.hemoglobin, l.hiv_result, l.urine_protein, l.glucose, l.syphilis,
        d.headache, d.blurred_vision, d.bleeding, d.convulsion, d.reduced_fetal_movement, d.severe_pain,
        t.iron, t.folate, t.vaccination, t.malaria_prevention, t.deworming
       FROM anc_visits av
       LEFT JOIN anc_vitals v ON v.anc_visit_id = av.id
       LEFT JOIN anc_labs l ON l.anc_visit_id = av.id
       LEFT JOIN danger_signs d ON d.anc_visit_id = av.id
       LEFT JOIN treatments t ON t.anc_visit_id = av.id
       WHERE av.pregnancy_id = ? ORDER BY av.visit_number`,
      [req.params.pregnancyId]
    );
    res.json({ visits });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load ANC visits' });
  }
});

module.exports = router;
