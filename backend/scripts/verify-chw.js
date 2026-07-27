/**
 * Deep CHW feature verification
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const login = await req('/auth/login', {
    method: 'POST',
    body: { username: 'chw1', password: 'password123', role: 'chw', facility_code: 'KGL-HC-01' },
  });
  assert(login.ok, `login ${JSON.stringify(login.data)}`);
  const token = login.data.token;

  const dash = await req('/dashboard', { token });
  assert(dash.ok, `dashboard ${JSON.stringify(dash.data)}`);
  const d = dash.data;

  assert(d.role_profile?.role === 'chw' || d.role_profile?.title, 'role_profile missing');
  assert(d.pregnancy_identification, 'pregnancy_identification missing');
  assert(d.home_followup, 'home_followup missing');
  assert(d.maternal_education, 'maternal_education missing');
  assert(d.ai_support?.followup_prioritization, 'followup_prioritization missing');
  assert(d.ai_support?.communication_assistant, 'communication_assistant missing');
  assert(d.ai_support?.location_risk_analysis, 'location_risk_analysis missing');

  const queue = d.ai_support.followup_prioritization.queue || [];
  const mothers = d.pregnancy_identification.assigned_mothers || d.assigned_mothers || [];
  const topics = d.maternal_education.topics || d.maternal_education || [];
  const locs = d.ai_support.location_risk_analysis.communities || [];

  console.log('CHW dashboard OK');
  console.log({
    title: d.role_profile.title,
    queue: queue.length,
    high: d.ai_support.followup_prioritization.counts?.HIGH,
    mothers: mothers.length,
    tasks: (d.home_followup.tasks || d.tasks || []).length,
    education_topics: Array.isArray(topics) ? topics.length : Object.keys(topics).length,
    location_communities: locs.length,
    visits_today: d.today?.visits_completed,
  });

  const pid =
    queue[0]?.pregnancy_id ||
    mothers[0]?.id ||
    mothers[0]?.pregnancy_id ||
    (d.home_followup.tasks || [])[0]?.pregnancy_id;

  assert(pid, 'No pregnancy available for CHW visit test');

  const visit = await req('/community/home-visit', {
    method: 'POST',
    token,
    body: {
      pregnancy_id: Number(pid),
      mother_condition: 'stable',
      challenges: ['transport', 'family_support'],
      education_topics: ['nutrition', 'danger_signs'],
      danger_signs: false,
      notes: 'Verification home visit — professional check',
      community_village: 'Kimisagara',
    },
  });
  assert(visit.ok, `home-visit ${JSON.stringify(visit.data)}`);
  console.log('home-visit OK', visit.data.message || visit.data.sms_stub?.template?.slice?.(0, 60) || 'saved');

  for (const template_type of ['reminder', 'education', 'high_priority']) {
    const sms = await req('/community/sms-draft', {
      method: 'POST',
      token,
      body: { pregnancy_id: Number(pid), template_type, topic: 'danger_signs' },
    });
    assert(sms.ok, `sms ${template_type} ${JSON.stringify(sms.data)}`);
    assert(sms.data.draft || sms.data.template || sms.data.message, `sms body missing for ${template_type}`);
    console.log(`sms ${template_type} OK`);
  }

  const tasks = await req('/community/tasks', { token });
  assert(tasks.ok, `tasks ${JSON.stringify(tasks.data)}`);
  console.log('tasks list OK', (tasks.data.tasks || []).length);

  console.log('ALL CHW CHECKS PASSED');
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
