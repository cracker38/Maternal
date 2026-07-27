const express = require('express');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { assertPregnancyAccess } = require('../utils/scope');
const {
  getFleetSummary,
  getActiveDispatches,
  assignAmbulance,
  createDispatch,
  updateDispatchStatus,
  STATUS_FLOW,
} = require('../services/ambulanceService');

const router = express.Router();

function canManageFleet(role) {
  return ['facility_admin', 'doctor', 'midwife'].includes(role);
}

function canAssignAmbulance(role) {
  return ['facility_admin', 'doctor', 'midwife'].includes(role);
}

/** Fleet overview: available, in use, remaining */
router.get('/fleet', authenticate, async (req, res) => {
  try {
    if (!req.user.facility_id) {
      return res.status(400).json({ error: 'Facility context required for ambulance fleet' });
    }
    const fleet = await getFleetSummary(req.user.facility_id);
    const active = await getActiveDispatches(req.user.facility_id);
    res.json({
      ...fleet,
      active_dispatches: active,
      role_capabilities: {
        can_request: ['midwife', 'doctor'].includes(req.user.role),
        can_assign: canAssignAmbulance(req.user.role),
        can_manage_fleet: canManageFleet(req.user.role),
        can_view_all: ['facility_admin', 'doctor', 'midwife', 'district_officer', 'moh'].includes(req.user.role),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load ambulance fleet' });
  }
});

/** All dispatches (active + recent) */
router.get('/dispatches', authenticate, async (req, res) => {
  try {
    if (!req.user.facility_id) return res.status(400).json({ error: 'Facility required' });
    const active = await getActiveDispatches(req.user.facility_id);
    const [recent] = await pool.execute(
      `SELECT d.*, a.unit_code, m.full_name AS mother_name, p.anc_number, u.full_name AS requester_name
       FROM ambulance_dispatches d
       LEFT JOIN ambulances a ON a.id = d.ambulance_id
       LEFT JOIN pregnancies p ON p.id = d.pregnancy_id
       LEFT JOIN mothers m ON m.id = p.mother_id
       LEFT JOIN users u ON u.id = d.requested_by
       WHERE d.facility_id = ?
       ORDER BY d.created_at DESC LIMIT 30`,
      [req.user.facility_id]
    );
    res.json({ active, recent, status_flow: STATUS_FLOW });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load dispatches' });
  }
});

/** Request ambulance (midwife/doctor) */
router.post('/request', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      pregnancy_id,
      emergency_id,
      labor_admission_id,
      urgency,
      destination_facility,
      pickup_location,
      reason,
      clinical_summary,
      eta_minutes,
      ambulance_id,
    } = req.body;

    if (!destination_facility) {
      return res.status(400).json({ error: 'destination_facility required' });
    }

    if (pregnancy_id) {
      const access = await assertPregnancyAccess(pool, req.user, pregnancy_id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
    }

    let assignedAmbulanceId = ambulance_id || null;
    if (assignedAmbulanceId && canAssignAmbulance(req.user.role)) {
      const check = await assignAmbulance(assignedAmbulanceId, req.user.facility_id);
      if (!check.ok) return res.status(409).json({ error: check.error });
    } else if (assignedAmbulanceId && !canAssignAmbulance(req.user.role)) {
      assignedAmbulanceId = null;
    }

    await conn.beginTransaction();
    const dispatchId = await createDispatch(conn, {
      facility_id: req.user.facility_id,
      ambulance_id: assignedAmbulanceId,
      pregnancy_id,
      emergency_id,
      labor_admission_id,
      requested_by: req.user.id,
      requester_role: req.user.role,
      urgency: urgency || 'urgent',
      pickup_location: pickup_location || req.user.facility_name || 'Originating facility',
      destination_facility,
      reason,
      clinical_summary,
      eta_minutes,
      assigned_by: assignedAmbulanceId ? req.user.id : null,
      status: assignedAmbulanceId ? 'assigned' : 'pending',
    });

    await conn.commit();
    await audit(req.user.id, req.user.facility_id, 'ambulance_request', 'ambulance_dispatch', dispatchId, {
      urgency,
      destination_facility,
      ambulance_id: assignedAmbulanceId,
    }, req.ip);

    const fleet = await getFleetSummary(req.user.facility_id);
    res.status(201).json({
      dispatch_id: dispatchId,
      status: assignedAmbulanceId ? 'assigned' : 'pending',
      message: assignedAmbulanceId
        ? 'Ambulance assigned. Dispatch team notified.'
        : 'Ambulance request queued. Facility admin or doctor will assign an available unit.',
      fleet_summary: fleet.summary,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Ambulance request failed', detail: e.message });
  } finally {
    conn.release();
  }
});

/** Assign ambulance to pending dispatch (admin/doctor/midwife) */
router.patch('/dispatches/:id/assign', authenticate, authorize('midwife', 'doctor', 'facility_admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { ambulance_id, eta_minutes } = req.body;
    if (!ambulance_id) return res.status(400).json({ error: 'ambulance_id required' });

    const check = await assignAmbulance(ambulance_id, req.user.facility_id);
    if (!check.ok) return res.status(409).json({ error: check.error });

    const [[dispatch]] = await conn.execute(
      'SELECT * FROM ambulance_dispatches WHERE id = ? AND facility_id = ?',
      [req.params.id, req.user.facility_id]
    );
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (!['pending', 'assigned'].includes(dispatch.status)) {
      return res.status(409).json({ error: `Dispatch is ${dispatch.status}, cannot reassign` });
    }

    await conn.beginTransaction();
    if (dispatch.ambulance_id && dispatch.ambulance_id !== ambulance_id) {
      await conn.execute(
        'UPDATE ambulances SET status = ? WHERE id = ?',
        ['available', dispatch.ambulance_id]
      );
    }
    await conn.execute(
      `UPDATE ambulance_dispatches SET ambulance_id = ?, status = 'assigned', assigned_by = ?, eta_minutes = COALESCE(?, eta_minutes), dispatched_at = NOW()
       WHERE id = ?`,
      [ambulance_id, req.user.id, eta_minutes ?? null, req.params.id]
    );
    await conn.execute(
      'UPDATE ambulances SET status = ?, current_location = ? WHERE id = ?',
      ['dispatched', dispatch.pickup_location || 'En route to pickup', ambulance_id]
    );
    await conn.commit();

    await audit(req.user.id, req.user.facility_id, 'ambulance_assign', 'ambulance_dispatch', Number(req.params.id), { ambulance_id }, req.ip);
    const fleet = await getFleetSummary(req.user.facility_id);
    res.json({
      ok: true,
      dispatch_id: Number(req.params.id),
      ambulance: check.ambulance,
      fleet_summary: fleet.summary,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Assignment failed' });
  } finally {
    conn.release();
  }
});

/** Update dispatch status (en_route, arrived, completed, cancelled) */
router.patch('/dispatches/:id/status', authenticate, authorize('midwife', 'doctor', 'facility_admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });

    await conn.beginTransaction();
    const result = await updateDispatchStatus(conn, Number(req.params.id), req.user.facility_id, status, req.user.id);
    if (!result.ok) {
      await conn.rollback();
      return res.status(409).json({ error: result.error });
    }
    await conn.commit();
    await audit(req.user.id, req.user.facility_id, 'ambulance_status', 'ambulance_dispatch', Number(req.params.id), { status }, req.ip);

    const fleet = await getFleetSummary(req.user.facility_id);
    res.json({ ...result, fleet_summary: fleet.summary });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Status update failed' });
  } finally {
    conn.release();
  }
});

/** Admin: add/update ambulance unit */
router.post('/fleet', authenticate, authorize('facility_admin'), async (req, res) => {
  try {
    const { unit_code, plate_number, vehicle_type, current_location, crew_lead, crew_phone, status } = req.body;
    if (!unit_code) return res.status(400).json({ error: 'unit_code required' });

    const [result] = await pool.execute(
      `INSERT INTO ambulances (facility_id, unit_code, plate_number, vehicle_type, status, current_location, crew_lead, crew_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.facility_id,
        unit_code,
        plate_number || null,
        vehicle_type || 'basic',
        status || 'available',
        current_location || null,
        crew_lead || null,
        crew_phone || null,
      ]
    );
    await audit(req.user.id, req.user.facility_id, 'ambulance_add', 'ambulance', result.insertId, { unit_code }, req.ip);
    res.status(201).json({ ambulance_id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Unit code already exists' });
    console.error(e);
    res.status(500).json({ error: 'Failed to add ambulance' });
  }
});

router.patch('/fleet/:id', authenticate, authorize('facility_admin'), async (req, res) => {
  try {
    const { status, current_location, crew_lead, crew_phone, notes } = req.body;
    await pool.execute(
      `UPDATE ambulances SET
        status = COALESCE(?, status),
        current_location = COALESCE(?, current_location),
        crew_lead = COALESCE(?, crew_lead),
        crew_phone = COALESCE(?, crew_phone),
        notes = COALESCE(?, notes)
       WHERE id = ? AND facility_id = ?`,
      [status || null, current_location ?? null, crew_lead ?? null, crew_phone ?? null, notes ?? null, req.params.id, req.user.facility_id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update ambulance' });
  }
});

module.exports = router;
