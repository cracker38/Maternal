const express = require('express');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const {
  evaluatePartograph,
  buildLaborWarnings,
  validateLaborAdmission,
  validatePartographEntry,
  calcGestationalAgeWeeks,
} = require('../services/riskEngine');
const { insertAlert } = require('../services/clinicalAudit');
const { assertPregnancyAccess } = require('../utils/scope');
const { createDispatch } = require('../services/ambulanceService');

const router = express.Router();

function parseAuditDetails(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

router.post('/admit', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const b = req.body;
    if (!b.pregnancy_id) return res.status(400).json({ error: 'pregnancy_id required' });

    const access = await assertPregnancyAccess(pool, req.user, b.pregnancy_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const validation = validateLaborAdmission(b);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error, missing: validation.missing });
    }

    await conn.beginTransaction();
    const [[preg]] = await conn.execute(
      `SELECT p.*, oh.previous_csection, oh.previous_pph, oh.previous_eclampsia
       FROM pregnancies p LEFT JOIN obstetric_history oh ON oh.pregnancy_id = p.id WHERE p.id = ?`,
      [b.pregnancy_id]
    );
    if (!preg) {
      await conn.rollback();
      return res.status(404).json({ error: 'Pregnancy not found' });
    }

    const ga = preg.lmp ? calcGestationalAgeWeeks(preg.lmp) : preg.gestational_age_weeks;
    if (ga == null) {
      await conn.rollback();
      return res.status(400).json({
        error: 'Required clinical information incomplete.',
        missing: ['Gestational age recorded'],
      });
    }

    const [result] = await conn.execute(
      `INSERT INTO labor_admissions (pregnancy_id, facility_id, admission_time, contractions, membrane_status,
        liquor, cervical_dilation, station, presentation, fhr, bp_systolic, bp_diastolic, pulse, admitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.pregnancy_id,
        req.user.facility_id,
        b.admission_time || new Date(),
        b.contractions || null,
        b.membrane_status || 'intact',
        b.liquor || null,
        b.cervical_dilation ?? null,
        b.station || null,
        b.presentation || null,
        b.fhr || null,
        b.bp_systolic || null,
        b.bp_diastolic || null,
        b.pulse || null,
        req.user.id,
      ]
    );

    await conn.execute(`UPDATE pregnancies SET status = 'labor', gestational_age_weeks = ? WHERE id = ?`, [
      ga,
      b.pregnancy_id,
    ]);

    await conn.execute(
      `INSERT INTO partograph_entries (labor_admission_id, recorded_at, fhr, liquor, cervical_dilation, station,
        bp_systolic, bp_diastolic, pulse, contractions_per_10min, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        b.admission_time || new Date(),
        b.fhr || null,
        b.liquor || null,
        b.cervical_dilation ?? null,
        b.station || null,
        b.bp_systolic || null,
        b.bp_diastolic || null,
        b.pulse || null,
        b.contractions_per_10min ?? null,
        req.user.id,
      ]
    );

    let dispatchId = null;
    if (b.ambulance_requested) {
      dispatchId = await createDispatch(conn, {
        facility_id: req.user.facility_id,
        ambulance_id: b.ambulance_id || null,
        pregnancy_id: b.pregnancy_id,
        labor_admission_id: result.insertId,
        requested_by: req.user.id,
        requester_role: req.user.role,
        urgency: b.ambulance_urgency || (preg.risk_score === 'CRITICAL' ? 'emergency' : 'urgent'),
        pickup_location: req.user.facility_name || 'Originating facility',
        destination_facility: b.ambulance_destination || 'Receiving facility to be confirmed',
        reason: b.ambulance_reason || 'Labor transfer preparedness',
        clinical_summary: b.admission_note || null,
        eta_minutes: b.ambulance_eta_minutes != null ? Number(b.ambulance_eta_minutes) : null,
        assigned_by: b.ambulance_id ? req.user.id : null,
        status: b.ambulance_id ? 'assigned' : 'pending',
      });
    }

    await conn.commit();

    const warnings = buildLaborWarnings(
      { high_risk: ['HIGH', 'CRITICAL'].includes(preg.risk_score) },
      {
        previous_csection: preg.previous_csection,
        previous_pph: preg.previous_pph,
      }
    );
    if (preg.risk_score === 'CRITICAL' || preg.risk_score === 'HIGH') {
      warnings.unshift('High-risk pregnancy');
    }

    const laborAudit = {
      admission_note: b.admission_note || null,
      ambulance_requested: !!b.ambulance_requested,
      ambulance: b.ambulance_requested ? {
        urgency: b.ambulance_urgency || (preg.risk_score === 'CRITICAL' ? 'emergency' : 'urgent'),
        destination_facility: b.ambulance_destination || 'Receiving facility to be confirmed',
        crew_contact: b.ambulance_crew_contact || null,
        eta_minutes: b.ambulance_eta_minutes != null ? Number(b.ambulance_eta_minutes) : null,
        requested_by: req.user.full_name || req.user.username,
        reason: b.ambulance_reason || 'Labor transfer preparedness',
        status: dispatchId ? (b.ambulance_id ? 'assigned' : 'pending') : 'requested',
        dispatch_id: dispatchId,
      } : null,
    };
    await audit(req.user.id, req.user.facility_id, 'labor_admit', 'labor_admission', result.insertId, laborAudit, req.ip);
    if (dispatchId) {
      await audit(req.user.id, req.user.facility_id, 'ambulance_request', 'ambulance_dispatch', dispatchId, laborAudit.ambulance, req.ip);
    }

    res.status(201).json({
      labor_admission_id: result.insertId,
      warning_banners: warnings,
      risk_score: preg.risk_score,
      gestational_age_weeks: ga,
      ambulance_request: laborAudit.ambulance,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Already admitted to labor' });
    res.status(500).json({ error: 'Labor admission failed' });
  } finally {
    conn.release();
  }
});

router.get('/pregnancy/:pregnancyId', authenticate, async (req, res) => {
  try {
    const [[labor]] = await pool.execute(
      `SELECT la.*, oh.previous_csection, oh.previous_pph, oh.previous_eclampsia, p.risk_score, m.full_name, p.anc_number
       FROM labor_admissions la
       JOIN pregnancies p ON p.id = la.pregnancy_id
       JOIN mothers m ON m.id = p.mother_id
       LEFT JOIN obstetric_history oh ON oh.pregnancy_id = p.id
       WHERE la.pregnancy_id = ?`,
      [req.params.pregnancyId]
    );
    if (!labor) return res.status(404).json({ error: 'No labor admission' });

    const [entries] = await pool.execute(
      `SELECT * FROM partograph_entries WHERE labor_admission_id = ? ORDER BY recorded_at ASC`,
      [labor.id]
    );
    const [auditRows] = await pool.execute(
      `SELECT action, details, created_at, user_id
       FROM audit_logs
       WHERE entity_type = 'labor_admission' AND entity_id = ?
         AND action IN ('labor_admit', 'labor_note', 'ambulance_request')
       ORDER BY created_at ASC`,
      [labor.id]
    );

    const evaluation = evaluatePartograph(entries, labor, {
      previous_csection: labor.previous_csection,
      previous_pph: labor.previous_pph,
    });

    const warnings = buildLaborWarnings(
      { high_risk: ['HIGH', 'CRITICAL'].includes(labor.risk_score) },
      { previous_csection: labor.previous_csection, previous_pph: labor.previous_pph }
    );
    if (['HIGH', 'CRITICAL'].includes(labor.risk_score)) warnings.unshift('High-risk pregnancy');
    const note_history = auditRows
      .filter((r) => ['labor_admit', 'labor_note'].includes(r.action))
      .map((r) => {
        const d = parseAuditDetails(r.details);
        return {
          action: r.action,
          note: d.admission_note || d.note || '',
          created_at: r.created_at,
          user_id: r.user_id,
        };
      })
      .filter((n) => n.note);
    const ambulance_requests = auditRows
      .filter((r) => r.action === 'ambulance_request')
      .map((r) => ({
        ...parseAuditDetails(r.details),
        created_at: r.created_at,
        user_id: r.user_id,
      }));

    res.json({
      labor,
      entries,
      evaluation,
      warning_banners: warnings,
      note_history,
      ambulance_requests,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load labor record' });
  }
});

router.post('/:laborId/partograph', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  try {
    const b = req.body;
    const validation = validatePartographEntry(b);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error, missing: validation.missing });
    }

    const [result] = await pool.execute(
      `INSERT INTO partograph_entries (labor_admission_id, recorded_at, fhr, liquor, molding, cervical_dilation,
        station, contractions_per_10min, contraction_duration_sec, bp_systolic, bp_diastolic, pulse,
        temperature, urine, medication, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.laborId,
        b.recorded_at || new Date(),
        b.fhr ?? null,
        b.liquor || null,
        b.molding || null,
        b.cervical_dilation ?? null,
        b.station || null,
        b.contractions_per_10min ?? null,
        b.contraction_duration_sec ?? null,
        b.bp_systolic ?? null,
        b.bp_diastolic ?? null,
        b.pulse ?? null,
        b.temperature ?? null,
        b.urine || null,
        b.medication || null,
        req.user.id,
      ]
    );

    const [[labor]] = await pool.execute(
      `SELECT la.*, oh.previous_csection, oh.previous_pph, p.id AS pregnancy_id, p.facility_id
       FROM labor_admissions la
       JOIN pregnancies p ON p.id = la.pregnancy_id
       LEFT JOIN obstetric_history oh ON oh.pregnancy_id = p.id
       WHERE la.id = ?`,
      [req.params.laborId]
    );

    const [entries] = await pool.execute(
      `SELECT * FROM partograph_entries WHERE labor_admission_id = ? ORDER BY recorded_at ASC`,
      [req.params.laborId]
    );

    const evaluation = evaluatePartograph(entries, labor, {
      previous_csection: labor?.previous_csection,
      previous_pph: labor?.previous_pph,
    });

    const [existingAlerts] = await pool.execute(
      `SELECT alert_type FROM alerts
       WHERE pregnancy_id = ? AND status = 'active'`,
      [labor.pregnancy_id]
    );
    const activeTypes = new Set(existingAlerts.map((x) => x.alert_type));
    for (const a of evaluation.alerts) {
      if (activeTypes.has(a.alert_type)) continue;
      await insertAlert(null, {
        pregnancyId: labor.pregnancy_id,
        facilityId: labor.facility_id,
        userId: req.user.id,
        alert: a,
      });
      activeTypes.add(a.alert_type);
    }

    if (evaluation.risk_score === 'CRITICAL' || evaluation.risk_score === 'HIGH') {
      await pool.execute(
        `UPDATE pregnancies SET risk_score = ?, risk_percent = GREATEST(COALESCE(risk_percent,0), ?)
         WHERE id = ? AND FIELD(risk_score,'LOW','MEDIUM','HIGH','CRITICAL') < FIELD(?,'LOW','MEDIUM','HIGH','CRITICAL')`,
        [evaluation.risk_score, evaluation.risk_percent, labor.pregnancy_id, evaluation.risk_score]
      );
    }

    await audit(req.user.id, req.user.facility_id, 'partograph_entry', 'partograph_entry', result.insertId, null, req.ip);

    res.status(201).json({
      entry_id: result.insertId,
      evaluation,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Partograph entry failed', detail: e.message });
  }
});

router.post('/:laborId/note', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  try {
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ error: 'note required' });
    await audit(
      req.user.id,
      req.user.facility_id,
      'labor_note',
      'labor_admission',
      Number(req.params.laborId),
      { note },
      req.ip
    );
    res.status(201).json({ recorded: true, note });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save labor note' });
  }
});

router.post('/:laborId/ambulance-request', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      urgency,
      destination_facility,
      crew_contact,
      eta_minutes,
      reason,
      clinical_summary,
      ambulance_id,
      pregnancy_id,
    } = req.body;
    if (!urgency || !destination_facility || !reason) {
      return res.status(400).json({ error: 'urgency, destination_facility, and reason required' });
    }

    await conn.beginTransaction();
    const dispatchId = await createDispatch(conn, {
      facility_id: req.user.facility_id,
      ambulance_id: ambulance_id || null,
      pregnancy_id: pregnancy_id || null,
      labor_admission_id: Number(req.params.laborId),
      requested_by: req.user.id,
      requester_role: req.user.role,
      urgency,
      pickup_location: req.user.facility_name || 'Originating facility',
      destination_facility,
      reason,
      clinical_summary: clinical_summary || (crew_contact ? `Crew contact: ${crew_contact}` : null),
      eta_minutes: eta_minutes != null ? Number(eta_minutes) : null,
      assigned_by: ambulance_id ? req.user.id : null,
      status: ambulance_id ? 'assigned' : 'pending',
    });
    await conn.commit();

    const request = {
      urgency,
      destination_facility,
      crew_contact: crew_contact || null,
      eta_minutes: eta_minutes != null ? Number(eta_minutes) : null,
      reason,
      clinical_summary: clinical_summary || null,
      dispatch_id: dispatchId,
      status: ambulance_id ? 'assigned' : 'pending',
    };
    await audit(
      req.user.id,
      req.user.facility_id,
      'ambulance_request',
      'ambulance_dispatch',
      dispatchId,
      request,
      req.ip
    );
    res.status(201).json({
      requested: true,
      dispatch_id: dispatchId,
      ambulance_request: request,
      message: urgency === 'emergency'
        ? 'Emergency ambulance dispatch queued. Continue stabilization and referral preparation.'
        : 'Ambulance request recorded in fleet system. Continue monitoring while transport is organized.',
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Failed to record ambulance request' });
  } finally {
    conn.release();
  }
});

module.exports = router;
