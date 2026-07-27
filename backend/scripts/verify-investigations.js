/**
 * Lab results + ultrasound verification
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

  const dash = await req('/dashboard', { token: midwife });
  assert(dash.ok, 'dashboard');
  const pid =
    dash.data.responsibilities?.anc?.caseload?.[0]?.id ||
    dash.data.responsibilities?.labor_delivery?.ward?.[0]?.pregnancy_id ||
    2;

  // Normal lab panel
  {
    const r = await req('/investigations/labs', {
      method: 'POST',
      token: midwife,
      body: {
        pregnancy_id: pid,
        hemoglobin: 12.1,
        blood_group: 'O+',
        rh_factor: 'positive',
        hiv_result: 'negative',
        syphilis_result: 'negative',
        hepatitis_b: 'negative',
        malaria_result: 'negative',
        urine_protein: 'negative',
        urine_glucose: 'negative',
        clinical_notes: 'Routine ANC labs — verify script',
      },
    });
    assert(r.ok, `normal labs: ${JSON.stringify(r.data)}`);
    assert(r.data.lab_result_id, 'lab_result_id');
    assert(r.data.alerts_created === 0, 'no alerts for normal labs');
    console.log('OK normal lab panel', r.data.lab_result_id);
  }

  // Abnormal lab (severe anemia) → alert
  {
    const r = await req('/investigations/labs', {
      method: 'POST',
      token: doctor,
      body: {
        pregnancy_id: pid,
        hemoglobin: 6.4,
        urine_protein: '2+',
        clinical_notes: 'Severe anemia test case',
      },
    });
    assert(r.ok, `abnormal labs: ${JSON.stringify(r.data)}`);
    assert(r.data.alerts_created >= 1, 'alerts for severe anemia');
    assert((r.data.abnormal_flags || []).includes('severe_anemia'), 'severe_anemia flag');
    console.log('OK abnormal labs', r.data.abnormal_flags, 'alerts', r.data.alerts_created);
  }

  // Ultrasound normal
  {
    const r = await req('/investigations/ultrasound', {
      method: 'POST',
      token: midwife,
      body: {
        pregnancy_id: pid,
        ga_by_ultrasound_weeks: 28,
        fetal_heart_activity: 'present',
        fetal_number: 'singleton',
        presentation: 'cephalic',
        placenta_location: 'anterior',
        amniotic_fluid: 'normal',
        estimated_fetal_weight_g: 1200,
        findings: 'Viable singleton, cephalic, normal liquor',
        impression: 'Normal obstetric ultrasound',
      },
    });
    assert(r.ok, `normal US: ${JSON.stringify(r.data)}`);
    assert(r.data.ultrasound_result_id, 'ultrasound_result_id');
    console.log('OK normal ultrasound', r.data.ultrasound_result_id);
  }

  // Ultrasound previa → alert
  {
    const r = await req('/investigations/ultrasound', {
      method: 'POST',
      token: doctor,
      body: {
        pregnancy_id: pid,
        fetal_heart_activity: 'present',
        placenta_location: 'previa',
        amniotic_fluid: 'oligohydramnios',
        presentation: 'breech',
        impression: 'Placenta previa with oligohydramnios — verify',
      },
    });
    assert(r.ok, `abnormal US: ${JSON.stringify(r.data)}`);
    assert(r.data.alerts_created >= 2, 'multiple US alerts');
    assert((r.data.abnormal_flags || []).includes('placenta_previa_risk'), 'previa flag');
    console.log('OK abnormal ultrasound', r.data.abnormal_flags);
  }

  // List + pregnancy record include investigations
  {
    const list = await req(`/investigations/pregnancy/${pid}`, { token: midwife });
    assert(list.ok, 'list investigations');
    assert(list.data.lab_results.length >= 2, 'labs listed');
    assert(list.data.ultrasound_results.length >= 2, 'US listed');

    const preg = await req(`/pregnancies/${pid}`, { token: midwife });
    assert(preg.ok, 'pregnancy record');
    assert(Array.isArray(preg.data.lab_results), 'lab_results on record');
    assert(Array.isArray(preg.data.ultrasound_results), 'ultrasound_results on record');
    console.log('OK pregnancy record includes labs', preg.data.lab_results.length, 'US', preg.data.ultrasound_results.length);
  }

  // Admin cannot record clinical labs
  {
    const blocked = await req('/investigations/labs', {
      method: 'POST',
      token: admin,
      body: { pregnancy_id: pid, hemoglobin: 11 },
    });
    assert(blocked.status === 403, 'admin blocked from labs');
    console.log('OK admin cannot record labs');
  }

  console.log('\nAll investigation checks passed.');
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
