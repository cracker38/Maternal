/**
 * Cross-role dashboard deep verification
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
  const chw = await login('chw1', 'chw', 'KGL-HC-01');
  const admin = await login('admin1', 'facility_admin', 'KGL-HC-01');
  const dho = await login('dho1', 'district_officer', 'GSO-DH-01');
  const moh = await login('moh1', 'moh');

  // Midwife
  {
    const d = await req('/dashboard', { token: midwife });
    assert(d.ok, 'midwife dash');
    assert(d.data.role_profile?.title, 'midwife profile');
    assert(d.data.responsibilities || d.data.ai_support, 'midwife work areas');
    console.log('OK midwife', d.data.role_profile.title);
  }

  // Doctor
  {
    const d = await req('/dashboard', { token: doctor });
    assert(d.ok, 'doctor dash');
    assert(d.data.clinical_review?.high_risk, 'doctor clinical review');
    assert(d.data.ai_support?.clinical_decision_support, 'doctor CDS');
    assert(d.data.ai_support?.emergency_prioritization?.queue, 'doctor priority');
    console.log('OK doctor', d.data.role_profile.title);
  }

  // CHW
  {
    const d = await req('/dashboard', { token: chw });
    assert(d.ok, 'chw dash');
    assert(d.data.pregnancy_identification, 'chw identification');
    assert(d.data.home_followup, 'chw followup');
    assert(d.data.ai_support?.followup_prioritization?.queue, 'chw prio');
    assert(d.data.ai_support?.location_risk_analysis, 'chw location');
    console.log('OK chw', d.data.role_profile.title, 'queue', d.data.ai_support.followup_prioritization.queue.length);
  }

  // Admin
  {
    const d = await req('/dashboard', { token: admin });
    assert(d.ok, 'admin dash');
    assert(d.data.user_management, 'admin users section');
    assert(d.data.ai_support?.data_quality_monitoring?.flags?.length >= 1, 'admin DQ AI');
    assert(d.data.ai_support?.facility_performance_analysis?.insights, 'admin perf AI');
    const fac = await req('/admin/facility', { token: admin });
    assert(fac.ok && fac.data.configuration?.departments?.length, 'admin facility config');
    const logs = await req('/admin/security-logs', { token: admin });
    assert(logs.ok && Array.isArray(logs.data.logs), 'admin security logs');
    console.log('OK admin', d.data.role_profile.title, 'flags', d.data.ai_support.data_quality_monitoring.flags.length);
  }

  // DHO
  {
    const d = await req('/dashboard', { token: dho });
    assert(d.ok, 'dho dash');
    assert(d.data.health_system_monitoring, 'dho monitoring');
    assert(d.data.facility_supervision?.facilities, 'dho supervision');
    assert(d.data.intervention_planning, 'dho interventions');
    assert(d.data.ai_support?.predictive_analytics?.predictions?.length >= 1, 'dho predictions');
    assert(d.data.ai_support?.dashboard_insights?.reports?.length >= 1, 'dho reports');
    const a = await req('/analytics?scope=district', { token: dho });
    assert(a.ok, 'dho analytics');
    console.log('OK dho', d.data.role_profile.title, 'facilities', d.data.facility_supervision.facilities.length);
  }

  // MoH
  {
    const d = await req('/dashboard', { token: moh });
    assert(d.ok, 'moh dash');
    assert(d.data.national_monitoring, 'moh monitoring');
    assert(d.data.policy_and_planning, 'moh policy');
    assert(d.data.digital_health_governance?.standards?.length >= 1, 'moh governance');
    assert(d.data.ai_support?.national_health_intelligence?.insights, 'moh AI intel');
    assert(d.data.ai_support?.report_generation?.reports?.length >= 1, 'moh reports');
    const a = await req('/analytics?scope=national', { token: moh });
    assert(a.ok, 'moh analytics');
    console.log('OK moh', d.data.role_profile.title, 'districts', (d.data.district_ranking || []).length);
  }

  // Clinical routes blocked for management roles (should still auth but may 403 on clinical write)
  {
    const r = await req('/mothers/search?q=test', { token: admin });
    // admin may or may not access search — record outcome
    console.log('admin mother search status', r.status, r.ok ? 'ok' : (r.data.error || 'denied'));
  }

  console.log('ALL DASHBOARD CHECKS PASSED');
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
