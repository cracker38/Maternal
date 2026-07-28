const pool = require('../db');

const STATUS_FLOW = {
  pending: ['assigned', 'cancelled'],
  assigned: ['dispatched', 'cancelled'],
  dispatched: ['en_route', 'cancelled'],
  en_route: ['arrived', 'cancelled'],
  arrived: ['completed'],
  completed: [],
  cancelled: [],
};

const AMBULANCE_STATUS_ON_DISPATCH = {
  assigned: 'dispatched',
  dispatched: 'dispatched',
  en_route: 'en_route',
  arrived: 'on_scene',
  completed: 'available',
  cancelled: 'available',
};

async function getFleetSummary(facilityId) {
  const [rows] = await pool.execute(
    `SELECT id, unit_code, plate_number, vehicle_type, status, current_location, crew_lead, crew_phone
     FROM ambulances WHERE facility_id = ? ORDER BY unit_code`,
    [facilityId]
  );
  const total = rows.length;
  const available = rows.filter((r) => r.status === 'available').length;
  const in_use = rows.filter((r) => ['dispatched', 'en_route', 'on_scene', 'returning'].includes(r.status)).length;
  const maintenance = rows.filter((r) => r.status === 'maintenance').length;
  return {
    fleet: rows,
    summary: { total, available, in_use, maintenance, remaining: available },
  };
}

async function getActiveDispatches(facilityId, { pregnancyId, emergencyId, laborId } = {}) {
  let sql = `
    SELECT d.*, a.unit_code, a.plate_number, a.vehicle_type, a.crew_lead, a.crew_phone,
           m.full_name AS mother_name, p.anc_number, u.full_name AS requester_name
    FROM ambulance_dispatches d
    LEFT JOIN ambulances a ON a.id = d.ambulance_id
    LEFT JOIN pregnancies p ON p.id = d.pregnancy_id
    LEFT JOIN mothers m ON m.id = p.mother_id
    LEFT JOIN users u ON u.id = d.requested_by
    WHERE d.facility_id = ? AND d.status NOT IN ('completed','cancelled')`;
  const params = [facilityId];
  if (pregnancyId) {
    sql += ' AND d.pregnancy_id = ?';
    params.push(pregnancyId);
  }
  if (emergencyId) {
    sql += ' AND d.emergency_id = ?';
    params.push(emergencyId);
  }
  if (laborId) {
    sql += ' AND d.labor_admission_id = ?';
    params.push(laborId);
  }
  sql += " ORDER BY CASE d.urgency WHEN 'emergency' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, d.created_at DESC";
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function assignAmbulance(ambulanceId, facilityId) {
  const [[amb]] = await pool.execute(
    'SELECT * FROM ambulances WHERE id = ? AND facility_id = ?',
    [ambulanceId, facilityId]
  );
  if (!amb) return { ok: false, error: 'Ambulance not found at this facility' };
  if (amb.status !== 'available') {
    return { ok: false, error: `Ambulance ${amb.unit_code} is not available (${amb.status})` };
  }
  return { ok: true, ambulance: amb };
}

async function createDispatch(conn, payload) {
  const {
    facility_id,
    ambulance_id,
    pregnancy_id,
    emergency_id,
    labor_admission_id,
    requested_by,
    requester_role,
    urgency,
    pickup_location,
    destination_facility,
    reason,
    clinical_summary,
    eta_minutes,
    assigned_by,
    status,
  } = payload;

  const [result] = await conn.execute(
    `INSERT INTO ambulance_dispatches (
      ambulance_id, facility_id, pregnancy_id, emergency_id, labor_admission_id,
      requested_by, requester_role, urgency, pickup_location, destination_facility,
      reason, clinical_summary, status, eta_minutes, assigned_by, dispatched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ambulance_id || null,
      facility_id,
      pregnancy_id || null,
      emergency_id || null,
      labor_admission_id || null,
      requested_by,
      requester_role,
      urgency || 'urgent',
      pickup_location || null,
      destination_facility,
      reason || null,
      clinical_summary || null,
      status || (ambulance_id ? 'assigned' : 'pending'),
      eta_minutes ?? null,
      assigned_by || null,
      ambulance_id ? new Date() : null,
    ]
  );

  if (ambulance_id) {
    const ambStatus = AMBULANCE_STATUS_ON_DISPATCH[status || 'assigned'] || 'dispatched';
    await conn.execute(
      'UPDATE ambulances SET status = ?, current_location = ? WHERE id = ?',
      [ambStatus, pickup_location || 'Dispatched', ambulance_id]
    );
  }

  return result.insertId;
}

async function updateDispatchStatus(conn, dispatchId, facilityId, newStatus, userId) {
  const [[dispatch]] = await conn.execute(
    'SELECT * FROM ambulance_dispatches WHERE id = ? AND facility_id = ?',
    [dispatchId, facilityId]
  );
  if (!dispatch) return { ok: false, error: 'Dispatch not found' };
  const allowed = STATUS_FLOW[dispatch.status] || [];
  if (!allowed.includes(newStatus)) {
    return { ok: false, error: `Cannot change status from ${dispatch.status} to ${newStatus}` };
  }

  const updates = { status: newStatus };
  if (newStatus === 'dispatched') updates.dispatched_at = new Date();
  if (newStatus === 'arrived') updates.arrived_at = new Date();
  if (newStatus === 'completed') updates.completed_at = new Date();

  await conn.execute(
    `UPDATE ambulance_dispatches SET
      status = ?,
      dispatched_at = COALESCE(?, dispatched_at),
      arrived_at = COALESCE(?, arrived_at),
      completed_at = COALESCE(?, completed_at)
     WHERE id = ?`,
    [newStatus, updates.dispatched_at || null, updates.arrived_at || null, updates.completed_at || null, dispatchId]
  );

  if (dispatch.ambulance_id) {
    const ambStatus = AMBULANCE_STATUS_ON_DISPATCH[newStatus];
    if (ambStatus) {
      await conn.execute('UPDATE ambulances SET status = ? WHERE id = ?', [ambStatus, dispatch.ambulance_id]);
    }
    if (newStatus === 'completed' || newStatus === 'cancelled') {
      await conn.execute(
        'UPDATE ambulances SET status = ?, current_location = ? WHERE id = ?',
        ['available', dispatch.destination_facility || 'Facility bay', dispatch.ambulance_id]
      );
    }
  }

  return { ok: true, dispatch_id: dispatchId, status: newStatus, updated_by: userId };
}

module.exports = {
  getFleetSummary,
  getActiveDispatches,
  assignAmbulance,
  createDispatch,
  updateDispatchStatus,
  STATUS_FLOW,
};
