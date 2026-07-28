const express = require('express');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { EMERGENCY_CHECKLISTS } = require('../services/riskEngine');
const { assertPregnancyAccess } = require('../utils/scope');
const { createDispatch, getActiveDispatches, getFleetSummary } = require('../services/ambulanceService');

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

router.post('/activate', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { pregnancy_id, emergency_type, notes, responding_person } = req.body;
    if (!pregnancy_id || !emergency_type) {
      return res.status(400).json({ error: 'pregnancy_id and emergency_type required' });
    }
    if (!EMERGENCY_CHECKLISTS[emergency_type]) {
      return res.status(400).json({ error: 'Invalid emergency type' });
    }

    const access = await assertPregnancyAccess(pool, req.user, pregnancy_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO emergencies (pregnancy_id, facility_id, emergency_type, activated_by, responding_person, activated_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        pregnancy_id,
        req.user.facility_id,
        emergency_type,
        req.user.id,
        responding_person || req.user.full_name || null,
        new Date().toISOString().slice(0,19).replace('T',' '),
        notes || null,
      ]
    );
    const emergencyId = result.insertId;
    const checklist = EMERGENCY_CHECKLISTS[emergency_type];

    for (let i = 0; i < checklist.length; i++) {
      await conn.execute(
        `INSERT INTO emergency_actions (emergency_id, action_label, sort_order) VALUES (?, ?, ?)`,
        [emergencyId, checklist[i], i + 1]
      );
    }

    await conn.execute(
      `INSERT INTO alerts (pregnancy_id, facility_id, alert_type, severity, title, message, recommended_actions, created_by)
       VALUES (?, ?, ?, 'CRITICAL', ?, ?, ?, ?)`,
      [
        pregnancy_id,
        req.user.facility_id,
        emergency_type,
        `Emergency activated: ${emergency_type.replace(/_/g, ' ').toUpperCase()}`,
        'WHO emergency checklist opened. Complete all actions with timestamps.',
        JSON.stringify(checklist),
        req.user.id,
      ]
    );

    await conn.commit();
    await audit(req.user.id, req.user.facility_id, 'emergency_activate', 'emergency', emergencyId, { emergency_type }, req.ip);

    const [actions] = await pool.execute(
      'SELECT * FROM emergency_actions WHERE emergency_id = ? ORDER BY sort_order',
      [emergencyId]
    );

    res.status(201).json({
      emergency_id: emergencyId,
      emergency_type,
      actions,
      checklist_source: 'WHO Emergency Checklist (adapted)',
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Emergency activation failed' });
  } finally {
    conn.release();
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const [[emergency]] = await pool.execute(
      `SELECT e.*, m.full_name, p.anc_number, p.risk_score
       FROM emergencies e
       JOIN pregnancies p ON p.id = e.pregnancy_id
       JOIN mothers m ON m.id = p.mother_id
       WHERE e.id = ?`,
      [req.params.id]
    );
    if (!emergency) return res.status(404).json({ error: 'Emergency not found' });
    const [actions] = await pool.execute(
      'SELECT * FROM emergency_actions WHERE emergency_id = ? ORDER BY sort_order',
      [req.params.id]
    );
    const [ambulanceAudit] = await pool.execute(
      `SELECT details, created_at, user_id
       FROM audit_logs
       WHERE entity_type = 'emergency' AND entity_id = ? AND action = 'ambulance_request'
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    const ambulance_requests = ambulanceAudit.map((r) => ({
      ...parseAuditDetails(r.details),
      created_at: r.created_at,
      user_id: r.user_id,
    }));
    const fleet_dispatches = emergency.facility_id
      ? await getActiveDispatches(emergency.facility_id, { emergencyId: Number(req.params.id) })
      : [];
    res.json({ emergency, actions, ambulance_requests, fleet_dispatches });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load emergency' });
  }
});

router.patch('/actions/:actionId', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  try {
    const { performed, medication, responsible_person } = req.body;
    await pool.execute(
      `UPDATE emergency_actions SET
        performed = ?,
        medication = CASE WHEN ? IS NOT NULL THEN ? ELSE medication END,
        responsible_person = CASE WHEN ? IS NOT NULL THEN ? ELSE responsible_person END,
        performed_at = CASE WHEN ? = 1 THEN ? ELSE performed_at END,
        performed_by = CASE WHEN ? = 1 THEN ? ELSE performed_by END
       WHERE id = ?`,
      [
        performed ? 1 : 0,
        medication || null, medication || null,
        responsible_person || req.user.full_name, responsible_person || req.user.full_name,
        performed ? 1 : 0, new Date().toISOString().slice(0,19).replace('T',' '),
        performed ? 1 : 0, req.user.id,
        req.params.actionId,
      ]
    );

    const [[action]] = await pool.execute('SELECT * FROM emergency_actions WHERE id = ?', [req.params.actionId]);
    await audit(req.user.id, req.user.facility_id, 'emergency_action', 'emergency_action', Number(req.params.actionId), { performed }, req.ip);
    res.json({ action });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update action' });
  }
});

router.patch('/:id/status', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  try {
    const { status, outcome, responding_person } = req.body;
    await pool.execute(
      `UPDATE emergencies SET
        status = CASE WHEN ? IS NOT NULL THEN ? ELSE status END,
        outcome = CASE WHEN ? IS NOT NULL THEN ? ELSE outcome END,
        responding_person = CASE WHEN ? IS NOT NULL THEN ? ELSE responding_person END
       WHERE id = ?`,
      [status || null, status || null, outcome || null, outcome || null, responding_person || null, responding_person || null, req.params.id]
    );
    await audit(
      req.user.id,
      req.user.facility_id,
      'emergency_outcome',
      'emergency',
      Number(req.params.id),
      { status, outcome },
      req.ip
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.post('/:id/ambulance-request', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[emergency]] = await conn.execute(
      'SELECT id, pregnancy_id, emergency_type, status, facility_id FROM emergencies WHERE id = ?',
      [req.params.id]
    );
    if (!emergency) return res.status(404).json({ error: 'Emergency not found' });

    const {
      destination_facility,
      eta_minutes,
      crew_contact,
      reason,
      ambulance_id,
    } = req.body;
    if (!destination_facility) {
      return res.status(400).json({ error: 'destination_facility required' });
    }

    await conn.beginTransaction();
    const dispatchId = await createDispatch(conn, {
      facility_id: req.user.facility_id,
      ambulance_id: ambulance_id || null,
      pregnancy_id: emergency.pregnancy_id,
      emergency_id: emergency.id,
      requested_by: req.user.id,
      requester_role: req.user.role,
      urgency: 'emergency',
      pickup_location: req.user.facility_name || 'Originating facility',
      destination_facility,
      reason: reason || `Emergency transfer for ${emergency.emergency_type}`,
      clinical_summary: crew_contact ? `Crew contact: ${crew_contact}` : null,
      eta_minutes: eta_minutes != null ? Number(eta_minutes) : null,
      assigned_by: ambulance_id ? req.user.id : null,
      status: ambulance_id ? 'assigned' : 'pending',
    });
    await conn.commit();

    const request = {
      urgency: 'emergency',
      destination_facility,
      eta_minutes: eta_minutes != null ? Number(eta_minutes) : null,
      crew_contact: crew_contact || null,
      reason: reason || `Emergency transfer for ${emergency.emergency_type}`,
      emergency_type: emergency.emergency_type,
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
    const fleet = await getFleetSummary(req.user.facility_id);
    res.status(201).json({
      requested: true,
      dispatch_id: dispatchId,
      ambulance_request: request,
      fleet_summary: fleet.summary,
      message: 'Emergency ambulance request queued in fleet system. Continue checklist while transport is assigned.',
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Failed to request ambulance' });
  } finally {
    conn.release();
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { getScope, facilityColumnScope } = require('../utils/scope');
    const scope = getScope(req.user);
    const eScope = facilityColumnScope(scope, 'e.facility_id');
    const [rows] = await pool.execute(
      `SELECT e.*, m.full_name, p.anc_number FROM emergencies e
       JOIN pregnancies p ON p.id = e.pregnancy_id
       JOIN mothers m ON m.id = p.mother_id
       WHERE 1=1 ${eScope.sql}
       ORDER BY e.activated_at DESC LIMIT 50`,
      eScope.params
    );
    res.json({ emergencies: rows, scope: { level: scope.level, facility_id: scope.facilityId, district: scope.district } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list emergencies' });
  }
});

module.exports = router;
