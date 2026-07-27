/**
 * RMDP end-to-end smoke tests
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
  if (!r.ok) throw new Error(`Login ${username}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const results = [];
  const pass = (name) => { results.push(`PASS ${name}`); console.log(`PASS ${name}`); };
  const fail = (name, e) => { results.push(`FAIL ${name}: ${e.message}`); console.error(`FAIL ${name}: ${e.message}`); };

  let midwife, doctor, chw, admin, dho, moh;

  try {
    midwife = await login('midwife1', 'midwife', 'KGL-HC-01');
    doctor = await login('doctor1', 'doctor', 'KGL-HC-01');
    chw = await login('chw1', 'chw', 'KGL-HC-01');
    admin = await login('admin1', 'facility_admin', 'KGL-HC-01');
    dho = await login('dho1', 'district_officer', 'GSO-DH-01');
    moh = await login('moh1', 'moh');
    pass('auth all roles');
  } catch (e) { fail('auth', e); return results; }

  // Bad login
  try {
    const bad = await req('/auth/login', {
      method: 'POST',
      body: { username: 'midwife1', password: 'wrong', role: 'midwife', facility_code: 'KGL-HC-01' },
    });
    assert(!bad.ok, 'should reject bad password');
    pass('auth rejects bad password');
  } catch (e) { fail('auth reject', e); }

  // Dashboards
  for (const [name, token, check] of [
    ['midwife dash', midwife, (d) => d.labor_ward && d.risk_center && d.performance],
    ['doctor dash', doctor, (d) => d.emergency_center && d.decision_queue && d.role_profile && d.ai_support?.clinical_decision_support],
    ['chw dash', chw, (d) => d.assigned_mothers && d.education && d.role_profile && d.ai_support?.followup_prioritization],
    ['admin dash', admin, (d) => d.facility_overview && d.data_quality && d.role_profile && d.ai_support?.data_quality_monitoring],
    ['dho dash', dho, (d) => d.by_facility && d.district_overview && d.role_profile && d.ai_support?.predictive_analytics],
    ['moh dash', moh, (d) => d.national_overview && d.predictions && d.role_profile && d.ai_support?.report_generation],
  ]) {
    try {
      const r = await req('/dashboard', { token });
      assert(r.ok, JSON.stringify(r.data));
      assert(check(r.data), 'missing sections');
      pass(name);
    } catch (e) { fail(name, e); }
  }

  // Analytics scopes
  for (const [token, scope, name] of [
    [midwife, 'facility', 'analytics facility'],
    [dho, 'district', 'analytics district'],
    [moh, 'national', 'analytics national'],
  ]) {
    try {
      const r = await req(`/analytics?scope=${scope}`, { token });
      assert(r.ok, JSON.stringify(r.data));
      assert(r.data.indicators, 'no indicators');
      pass(name);
    } catch (e) { fail(name, e); }
  }

  // Mother search scoped
  try {
    const r = await req('/mothers/search?q=Claudine', { token: midwife });
    assert(r.ok, JSON.stringify(r.data));
    assert(r.data.results.length >= 1, 'expected search hit');
    pass('mother search');
  } catch (e) { fail('mother search', e); }

  // Pregnancy record
  try {
    const r = await req('/pregnancies/1', { token: midwife });
    assert(r.ok, JSON.stringify(r.data));
    assert(r.data.pregnancy && r.data.timeline, 'incomplete record');
    pass('pregnancy record');
  } catch (e) { fail('pregnancy record', e); }

  // ANC visit + risk engine
  try {
    const r = await req('/anc', {
      method: 'POST',
      token: midwife,
      body: {
        pregnancy_id: 2,
        vitals: { bp_systolic: 150, bp_diastolic: 96, fetal_heart_rate: 140, fetal_movement: 'normal' },
        labs: { hemoglobin: 6.2, urine_protein: '2+' },
        danger: { headache: true, blurred_vision: true },
        treatment: { iron: true, folate: true },
        counseling: { nutrition: true, birth_prep: true, danger_signs: true },
      },
    });
    assert(r.ok, JSON.stringify(r.data));
    assert(r.data.risk_score === 'CRITICAL', `expected CRITICAL got ${r.data.risk_score}`);
    assert(r.data.alerts?.length > 0, 'expected alerts');
    pass('ANC risk engine CRITICAL');
  } catch (e) { fail('ANC risk engine', e); }

  // Labor partograph
  try {
    const labor = await req('/labor/pregnancy/4', { token: midwife });
    assert(labor.ok, JSON.stringify(labor.data));
    const laborId = labor.data.labor.id;
    const entry = await req(`/labor/${laborId}/partograph`, {
      method: 'POST',
      token: midwife,
      body: {
        fhr: 100,
        cervical_dilation: 6,
        bp_systolic: 130,
        bp_diastolic: 85,
        pulse: 90,
        contractions_per_10min: 4,
      },
    });
    assert(entry.ok, JSON.stringify(entry.data));
    assert(entry.data.evaluation?.alerts?.some((a) => a.alert_type === 'fetal_distress'), 'expected fetal distress');
    pass('partograph fetal distress');
  } catch (e) { fail('partograph', e); }

  // Postpartum PPH
  try {
    const r = await req('/postpartum/assess', {
      method: 'POST',
      token: midwife,
      body: {
        pregnancy_id: 6,
        checkpoint: '6h',
        bleeding: 'heavy',
        uterus_tone: 'boggy',
        bp_systolic: 85,
        bp_diastolic: 50,
        temperature: 36.8,
        breastfeeding: 'yes',
        pain_score: 4,
      },
    });
    assert(r.ok, JSON.stringify(r.data));
    assert(r.data.pph_suspected === true, 'expected PPH');
    assert(r.data.emergency_id, 'expected emergency id');
    pass('PPH detection + emergency');
  } catch (e) { fail('PPH', e); }

  // Emergency checklist action
  try {
    const list = await req('/emergencies', { token: doctor });
    assert(list.ok, JSON.stringify(list.data));
    const em = list.data.emergencies?.[0];
    assert(em, 'no emergencies');
    const detail = await req(`/emergencies/${em.id}`, { token: doctor });
    assert(detail.ok, JSON.stringify(detail.data));
    const action = detail.data.actions?.[0];
    if (action && !action.performed) {
      const upd = await req(`/emergencies/actions/${action.id}`, {
        method: 'PATCH',
        token: doctor,
        body: { performed: true, responsible_person: 'Dr. Jean Mugisha' },
      });
      assert(upd.ok, JSON.stringify(upd.data));
    }
    pass('emergency checklist');
  } catch (e) { fail('emergency checklist', e); }

  // Referral approve
  try {
    const dash = await req('/dashboard', { token: doctor });
    const ref = dash.data.decision_queue?.pending_referrals?.[0];
    if (ref) {
      const r = await req(`/pregnancies/referrals/${ref.id}`, {
        method: 'PATCH',
        token: doctor,
        body: { status: 'accepted', clinical_recommendation: 'Accept referral — stabilize and transfer' },
      });
      assert(r.ok, JSON.stringify(r.data));
      pass('referral approve');
    } else {
      pass('referral approve (none pending — skipped)');
    }
  } catch (e) { fail('referral approve', e); }

  // Alert ack
  try {
    const dash = await req('/dashboard', { token: doctor });
    const alert = dash.data.decision_queue?.ai_to_validate?.[0];
    if (alert) {
      const r = await req(`/pregnancies/alerts/${alert.id}/ack`, {
        method: 'PATCH',
        token: doctor,
        body: { confirmation_note: 'Doctor confirmed AI — clinical judgment applied' },
      });
      assert(r.ok, JSON.stringify(r.data));
      assert(r.data.human_confirmed === true, 'expected human_confirmed');
      pass('alert acknowledge');
    } else {
      pass('alert acknowledge (none — skipped)');
    }
  } catch (e) { fail('alert acknowledge', e); }

  // Doctor CDS payload
  try {
    const dash = await req('/dashboard', { token: doctor });
    assert(dash.ok, JSON.stringify(dash.data));
    assert(dash.data.role_profile?.title?.includes('Doctor'), 'missing doctor role profile');
    assert(dash.data.ai_support?.clinical_decision_support?.example?.output?.possible_diagnosis, 'missing CDS example');
    assert(dash.data.ai_support?.emergency_prioritization?.queue, 'missing priority queue');
    assert(dash.data.clinical_review?.high_risk, 'missing clinical review');
    assert(dash.data.referral_management?.tracking_steps?.includes('accepted'), 'missing referral tracking');
    pass('doctor clinical decision support');
  } catch (e) { fail('doctor CDS', e); }

  // Community CHW
  try {
    const r = await req('/community/tasks', { token: chw });
    assert(r.ok, JSON.stringify(r.data));
    assert(Array.isArray(r.data.tasks), 'tasks array');
    pass('chw community tasks');
  } catch (e) { fail('chw community', e); }

  // CHW home visit + SMS draft
  try {
    const dash = await req('/dashboard', { token: chw });
    assert(dash.ok, JSON.stringify(dash.data));
    assert(dash.data.ai_support?.location_risk_analysis, 'missing location risk');
    const mother = dash.data.assigned_mothers?.[0];
    if (mother) {
      const visit = await req('/community/home-visit', {
        method: 'POST',
        token: chw,
        body: {
          pregnancy_id: mother.id,
          mother_condition: 'stable',
          challenges: ['Transport'],
          education_topics: ['Danger signs', 'Nutrition'],
          notes: 'Smoke-test home visit',
        },
      });
      assert(visit.ok, JSON.stringify(visit.data));
      assert(visit.data.recorded === true, 'expected recorded');
      const sms = await req('/community/sms-draft', {
        method: 'POST',
        token: chw,
        body: { pregnancy_id: mother.id, template_type: 'reminder' },
      });
      assert(sms.ok, JSON.stringify(sms.data));
      assert(sms.data.message, 'expected sms message');
      pass('chw home visit + SMS');
    } else {
      pass('chw home visit + SMS (no assigned mother — skipped)');
    }
  } catch (e) { fail('chw home visit', e); }

  // Admin users
  try {
    const r = await req('/admin/users', { token: admin });
    assert(r.ok, JSON.stringify(r.data));
    assert(r.data.users?.length >= 1, 'expected users');
    const fac = await req('/admin/facility', { token: admin });
    assert(fac.ok, JSON.stringify(fac.data));
    assert(fac.data.configuration?.departments?.length >= 1, 'expected departments');
    const patch = await req('/admin/facility', {
      method: 'PATCH',
      token: admin,
      body: {
        phone: fac.data.facility?.phone || '0780000000',
        departments: fac.data.configuration.departments,
        services: fac.data.configuration.services,
      },
    });
    assert(patch.ok, JSON.stringify(patch.data));
    const dash = await req('/dashboard', { token: admin });
    assert(dash.data.ai_support?.facility_performance_analysis?.insights, 'admin AI insights');
    pass('admin users+facility');
  } catch (e) { fail('admin', e); }

  // DHO + MoH AI payloads
  try {
    const dhoDash = await req('/dashboard', { token: dho });
    assert(dhoDash.ok, JSON.stringify(dhoDash.data));
    assert(dhoDash.data.health_system_monitoring, 'dho monitoring');
    assert(dhoDash.data.ai_support?.maternal_health_analytics?.insights, 'dho AI insights');
    const mohDash = await req('/dashboard', { token: moh });
    assert(mohDash.ok, JSON.stringify(mohDash.data));
    assert(mohDash.data.digital_health_governance?.standards?.length >= 1, 'moh governance');
    assert(mohDash.data.ai_support?.predictive_modeling?.example?.output, 'moh predictive example');
    pass('dho+moh management AI');
  } catch (e) { fail('dho+moh AI', e); }

  // Scope isolation: midwife cannot use wrong facility code at login already tested
  // Register pregnancy
  try {
    const stamp = Date.now();
    const r = await req('/pregnancies', {
      method: 'POST',
      token: midwife,
      body: {
        full_name: `Test Mother ${stamp}`,
        date_of_birth: '1995-01-01',
        national_id: `1${String(stamp).slice(-15)}`,
        phone: `07${String(stamp).slice(-8)}`,
        district: 'Gasabo',
        lmp: '2026-01-01',
        gravida: 1,
        para: 0,
        obstetric: { previous_csection: true },
        medical: { hypertension: true },
      },
    });
    assert(r.ok, JSON.stringify(r.data));
    assert(r.data.pregnancy_id, 'no pregnancy_id');
    assert(['HIGH', 'CRITICAL'].includes(r.data.risk_score), `risk ${r.data.risk_score}`);
    assert(r.data.risk_percent != null, 'expected risk_percent');
    const rec = await req(`/pregnancies/${r.data.pregnancy_id}`, { token: midwife });
    assert(rec.ok, JSON.stringify(rec.data));
    pass('register pregnancy + risk');
  } catch (e) { fail('register pregnancy', e); }

  // Delivery flow for a labor patient if possible — use pregnancy 5 if still labor
  try {
    const preg = await req('/pregnancies/5', { token: midwife });
    if (preg.ok && preg.data.pregnancy?.status === 'labor') {
      const del = await req('/deliveries', {
        method: 'POST',
        token: midwife,
        body: {
          pregnancy_id: 5,
          delivery_method: 'svd',
          blood_loss_ml: 300,
          tears: 'none',
          placenta_condition: 'complete',
          baby: { birth_weight_g: 3100, sex: 'female', apgar_1: 8, apgar_5: 9, resuscitation: false },
        },
      });
      assert(del.ok, JSON.stringify(del.data));
      assert(del.data.mother_status === 'postpartum', 'should move to postpartum');
      pass('delivery documentation');
    } else {
      pass('delivery documentation (patient not in labor — skipped)');
    }
  } catch (e) { fail('delivery', e); }

  // Rule 1.2 — duplicate mother prevention
  try {
    const stamp = Date.now();
    const nid = `9${String(stamp).slice(-15)}`;
    const first = await req('/pregnancies', {
      method: 'POST',
      token: midwife,
      body: {
        full_name: `Dup Check ${stamp}`,
        date_of_birth: '1992-05-05',
        national_id: nid,
        phone: `07${String(stamp).slice(-8)}`,
        district: 'Gasabo',
        lmp: '2026-02-01',
        gravida: 1,
        para: 0,
      },
    });
    assert(first.ok, JSON.stringify(first.data));
    const dup = await req(`/mothers/duplicate-check?national_id=${nid}`, { token: midwife });
    assert(dup.ok && dup.data.duplicate === true, 'expected duplicate');
    assert(String(dup.data.message).includes('Mother already registered'), 'expected message');
    const blocked = await req('/pregnancies', {
      method: 'POST',
      token: midwife,
      body: {
        full_name: `Dup Check Again ${stamp}`,
        date_of_birth: '1992-05-05',
        national_id: nid,
        lmp: '2026-02-01',
      },
    });
    assert(blocked.status === 409, 'expected 409 on duplicate register');
    pass('duplicate mother prevention');
  } catch (e) { fail('duplicate mother', e); }

  // Rule 1.3 — ANC mandatory fields
  try {
    const incomplete = await req('/anc', {
      method: 'POST',
      token: midwife,
      body: { pregnancy_id: 2, vitals: { temperature: 36.5 }, labs: {}, danger: {} },
    });
    assert(!incomplete.ok && incomplete.status === 400, 'expected incomplete ANC rejection');
    assert(String(incomplete.data.error).includes('incomplete'), incomplete.data.error);
    pass('ANC mandatory validation');
  } catch (e) { fail('ANC mandatory', e); }

  // Rule 3.2 — severe hypertension BP ≥160/110
  try {
    const r = await req('/anc', {
      method: 'POST',
      token: midwife,
      body: {
        pregnancy_id: 2,
        vitals: { bp_systolic: 165, bp_diastolic: 112, fetal_heart_rate: 138 },
        labs: { hemoglobin: 11.2, urine_protein: 'negative' },
        danger: { headache: false },
      },
    });
    assert(r.ok, JSON.stringify(r.data));
    assert(r.data.alerts?.some((a) => a.alert_type === 'severe_hypertension'), 'expected severe HTN alert');
    assert(r.data.risk_percent != null, 'expected risk percent');
    pass('severe hypertension rule');
  } catch (e) { fail('severe hypertension', e); }

  // Rule 1.4 — no clinical delete
  try {
    const del = await req('/pregnancies/1', { method: 'DELETE', token: midwife });
    assert(del.status === 403, 'expected delete forbidden');
    pass('clinical delete forbidden');
  } catch (e) { fail('clinical delete', e); }

  // Missed ANC processor
  try {
    const r = await req('/anc/process-missed', { method: 'POST', token: midwife });
    assert(r.ok, JSON.stringify(r.data));
    assert(typeof r.data.processed === 'number', 'expected processed count');
    pass('missed ANC processor');
  } catch (e) { fail('missed ANC', e); }

  const failed = results.filter((r) => r.startsWith('FAIL'));
  console.log('\n--- SUMMARY ---');
  console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
  return results;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
