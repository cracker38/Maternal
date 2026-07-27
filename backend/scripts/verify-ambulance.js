/**
 * Ambulance fleet & dispatch verification
 */
const API = process.env.API_URL || 'http://localhost:5001/api';

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function login(username, role, facility_code) {
  const body = { username, password: 'password123', role };
  if (facility_code) body.facility_code = facility_code;
  const r = await req('/auth/login', { method: 'POST', body });
  if (!r.ok) throw new Error(`login ${username}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const midwife = await login('midwife1', 'midwife', 'KGL-HC-01');
  const doctor = await login('doctor1', 'doctor', 'KGL-HC-01');
  const admin = await login('admin1', 'facility_admin', 'KGL-HC-01');

  // Fleet overview
  {
    const f = await req('/ambulance/fleet', { token: midwife });
    assert(f.ok, 'fleet load');
    assert(f.data.summary?.total >= 1, 'fleet seeded');
    assert(typeof f.data.summary.remaining === 'number', 'remaining count');
    assert(Array.isArray(f.data.fleet), 'fleet units');
    assert(f.data.role_capabilities?.can_request, 'midwife can request');
    console.log('OK fleet', f.data.summary.total, 'units,', f.data.summary.remaining, 'available');
  }

  // Dashboard includes ambulance block
  {
    const d = await req('/dashboard', { token: midwife });
    assert(d.ok && d.data.ambulance?.summary, 'dashboard ambulance');
    console.log('OK dashboard ambulance widget');
  }

  // Request ambulance (queued)
  let dispatchId;
  {
    const d = await req('/dashboard', { token: midwife });
    const pid =
      d.data.responsibilities?.anc?.caseload?.[0]?.id ||
      d.data.responsibilities?.labor_delivery?.ward?.[0]?.pregnancy_id ||
      2;
    assert(pid, 'pregnancy for dispatch test');

    const r = await req('/ambulance/request', {
      method: 'POST',
      token: midwife,
      body: {
        pregnancy_id: pid,
        destination_facility: 'Kigali University Teaching Hospital',
        urgency: 'urgent',
        reason: 'Verify script — transfer readiness',
        pickup_location: 'KGL-HC-01',
      },
    });
    assert(r.ok, `request: ${JSON.stringify(r.data)}`);
    dispatchId = r.data.dispatch_id;
    assert(dispatchId, 'dispatch_id returned');
    assert(r.data.fleet_summary, 'fleet summary on request');
    console.log('OK request dispatch', dispatchId, 'status', r.data.status);
  }

  // Assign unit
  {
    const f = await req('/ambulance/fleet', { token: admin });
    const unit = (f.data.fleet || []).find((u) => u.status === 'available');
    assert(unit, 'available unit for assign');

    const a = await req(`/ambulance/dispatches/${dispatchId}/assign`, {
      method: 'PATCH',
      token: admin,
      body: { ambulance_id: unit.id, eta_minutes: 18 },
    });
    assert(a.ok, `assign: ${JSON.stringify(a.data)}`);
    assert(a.data.fleet_summary.in_use >= 1, 'unit in use after assign');
    console.log('OK assign', unit.unit_code);
  }

  // Status progression
  {
    for (const status of ['dispatched', 'en_route', 'arrived', 'completed']) {
      const s = await req(`/ambulance/dispatches/${dispatchId}/status`, {
        method: 'PATCH',
        token: doctor,
        body: { status },
      });
      assert(s.ok, `status ${status}: ${JSON.stringify(s.data)}`);
    }
    const f = await req('/ambulance/fleet', { token: doctor });
    assert(f.data.summary.remaining >= 1, 'unit returned after completed');
    console.log('OK status flow completed');
  }

  // Dispatches list
  {
    const d = await req('/ambulance/dispatches', { token: admin });
    assert(d.ok && Array.isArray(d.data.recent), 'dispatches list');
    assert(d.data.status_flow, 'status flow documented');
    console.log('OK dispatches history', d.data.recent.length, 'records');
  }

  console.log('\nAll ambulance checks passed.');
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
