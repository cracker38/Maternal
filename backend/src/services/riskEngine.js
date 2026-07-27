/**
 * RMDP Clinical Rules Engine
 * Deterministic WHO/MoH-aligned decision support.
 * AI recommendations support clinicians — they never replace clinical judgment.
 */

const SEVERITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const RISK_SCORE_BASE = { LOW: 15, MEDIUM: 40, HIGH: 70, CRITICAL: 92 };

function maxSeverity(a, b) {
  if (!a) return b;
  if (!b) return a;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function calcGestationalAgeWeeks(lmp, asOf = new Date()) {
  if (!lmp) return null;
  const lmpDate = new Date(lmp);
  const weeks = (asOf - lmpDate) / (1000 * 60 * 60 * 24 * 7);
  return Math.round(weeks * 10) / 10;
}

function calcEDD(lmp) {
  if (!lmp) return null;
  const d = new Date(lmp);
  d.setDate(d.getDate() + 280);
  return d.toISOString().slice(0, 10);
}

function calcAgeYears(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function withAiMeta(alert, explanation, riskPoints = 0) {
  return {
    ...alert,
    ai_decision_support: true,
    requires_human_confirmation: true,
    explanation,
    risk_points: riskPoints,
    disclaimer: 'AI recommendation supports clinical decision-making. Final medical decisions require a qualified clinician.',
  };
}

function toPercentScore(riskLabel, points) {
  const base = RISK_SCORE_BASE[riskLabel] || 15;
  const pct = Math.min(99, Math.max(5, base + Math.min(20, points)));
  return pct;
}

/** Rule 2.2 — Registration risk classification */
function scoreRegistrationRisk({ obstetric = {}, medical = {}, gravida, para, abortions, date_of_birth, multiple_pregnancy }) {
  const alerts = [];
  let risk = 'LOW';
  let points = 0;
  const age = calcAgeYears(date_of_birth);

  if (age != null && (age < 18 || age >= 35)) {
    risk = maxSeverity(risk, 'MEDIUM');
    points += 8;
    alerts.push(withAiMeta({
      alert_type: 'age_related_risk',
      severity: 'MEDIUM',
      title: 'Age-related pregnancy risk',
      message: `Maternal age ${age} years increases obstetric risk.`,
      recommended_actions: ['Individualized ANC schedule', 'Counsel birth preparedness'],
    }, 'Age <18 or ≥35 is associated with higher maternal risk.', 8));
  }

  if ((abortions || 0) >= 1 || obstetric.previous_stillbirth) {
    risk = maxSeverity(risk, 'MEDIUM');
    points += 6;
  }

  if (multiple_pregnancy) {
    risk = maxSeverity(risk, 'HIGH');
    points += 15;
    alerts.push(withAiMeta({
      alert_type: 'multiple_pregnancy',
      severity: 'HIGH',
      title: 'Multiple pregnancy',
      message: 'Multiple gestation increases maternal and fetal risk.',
      recommended_actions: ['Specialist co-management', 'Closer monitoring', 'Facility birth'],
    }, 'Multiple pregnancy is classified as high risk per RMDP rules.', 15));
  }

  if (obstetric.previous_csection) {
    risk = maxSeverity(risk, 'HIGH');
    points += 18;
    alerts.push(withAiMeta({
      alert_type: 'previous_csection',
      severity: 'HIGH',
      title: 'Previous C-section',
      message: 'History of caesarean section — plan birth preparedness and scar monitoring.',
      recommended_actions: ['Senior midwife review', 'Facility birth strongly advised', 'Prepare for possible C-section'],
    }, 'Previous C-section is a High Risk classification factor.', 18));
  }
  if (obstetric.previous_pph) {
    risk = maxSeverity(risk, 'HIGH');
    points += 14;
    alerts.push(withAiMeta({
      alert_type: 'previous_pph',
      severity: 'HIGH',
      title: 'Previous postpartum hemorrhage',
      message: 'Prior PPH increases risk of recurrence.',
      recommended_actions: ['PPH preparedness kit ready', 'Active management of third stage', 'Notify doctor on admission'],
    }, 'Prior PPH history raises recurrence risk.', 14));
  }
  if (obstetric.previous_eclampsia) {
    risk = maxSeverity(risk, 'CRITICAL');
    points += 25;
    alerts.push(withAiMeta({
      alert_type: 'previous_eclampsia',
      severity: 'CRITICAL',
      title: 'Previous eclampsia',
      message: 'High risk of hypertensive disorders of pregnancy.',
      recommended_actions: ['Close BP monitoring', 'Early specialist review', 'Counsel danger signs'],
    }, 'Previous eclampsia → Critical Risk until cleared by clinician.', 25));
  }
  if (obstetric.previous_stillbirth || obstetric.previous_premature) {
    risk = maxSeverity(risk, 'HIGH');
    points += 10;
  }
  if (medical.hypertension || medical.diabetes || medical.sickle_cell) {
    risk = maxSeverity(risk, 'HIGH');
    points += 16;
    alerts.push(withAiMeta({
      alert_type: 'medical_comorbidity',
      severity: 'HIGH',
      title: 'Significant medical history',
      message: 'Chronic condition increases maternal risk.',
      recommended_actions: ['Doctor co-management', 'Individualized ANC schedule'],
    }, 'Chronic comorbidity warrants High Risk co-management.', 16));
  }
  if (medical.hiv) {
    risk = maxSeverity(risk, 'HIGH');
    points += 12;
  }
  if ((gravida || 1) >= 5) {
    risk = maxSeverity(risk, 'MEDIUM');
    points += 5;
  }

  return {
    risk_score: risk,
    risk_percent: toPercentScore(risk, points),
    alerts,
    ai_disclaimer: 'Risk score supports triage. Clinician confirms final classification.',
  };
}

/** ANC visit evaluation — Rules 3.2–3.4 */
function evaluateAncVisit({ vitals = {}, labs = {}, danger = {}, obstetric = {} }) {
  const alerts = [];
  let risk = 'LOW';
  let points = 0;

  const sys = Number(vitals.bp_systolic);
  const dia = Number(vitals.bp_diastolic);
  const protein = labs.urine_protein;
  const hb = labs.hemoglobin != null ? Number(labs.hemoglobin) : null;

  // Rule 3.2 — BP
  if (sys >= 160 || dia >= 110) {
    risk = maxSeverity(risk, 'CRITICAL');
    points += 30;
    alerts.push(withAiMeta({
      alert_type: 'severe_hypertension',
      severity: 'CRITICAL',
      title: 'Severe hypertension detected',
      message: `BP ${sys}/${dia} mmHg (≥160/110). Immediate clinical review required.`,
      recommended_actions: ['Immediate doctor review', 'Emergency preparedness', 'Do not delay', 'Consider referral'],
    }, 'Rule 3.2: BP ≥160/110 triggers emergency hypertension alert.', 30));
  } else if (sys >= 140 || dia >= 90) {
    risk = maxSeverity(risk, 'HIGH');
    points += 14;
    alerts.push(withAiMeta({
      alert_type: 'hypertension',
      severity: 'HIGH',
      title: 'Elevated blood pressure detected',
      message: `BP ${sys}/${dia} mmHg (≥140/90).`,
      recommended_actions: ['Notify doctor', 'Increase monitoring', 'Recheck BP', 'Counsel danger signs'],
    }, 'Rule 3.2: BP ≥140/90 creates hypertension warning.', 14));
  }

  // Rule 3.3 — Preeclampsia
  const significantProtein = protein && !['negative', 'trace'].includes(String(protein));
  if ((sys >= 140 || dia >= 90) && significantProtein) {
    risk = maxSeverity(risk, 'CRITICAL');
    points += 28;
    alerts.push(withAiMeta({
      alert_type: 'preeclampsia',
      severity: 'CRITICAL',
      title: 'POSSIBLE PREECLAMPSIA ALERT',
      message: `High BP (${sys}/${dia}) with proteinuria (${protein}).`,
      recommended_actions: ['Notify doctor', 'Mark pregnancy high-risk', 'Referral assessment', 'Monitor fetal wellbeing'],
    }, 'Rule 3.3: High BP + proteinuria → possible preeclampsia.', 28));
  }

  // Rule 3.4 — Anemia
  if (hb != null && hb < 7) {
    risk = maxSeverity(risk, 'CRITICAL');
    points += 26;
    alerts.push(withAiMeta({
      alert_type: 'severe_anemia',
      severity: 'CRITICAL',
      title: 'Severe Anemia Alert',
      message: `Hemoglobin ${hb} g/dL (<7).`,
      recommended_actions: ['Notify doctor', 'Increase monitoring frequency', 'Record management plan', 'Consider referral/transfusion readiness'],
    }, 'Rule 3.4: Hb <7 g/dL is Critical Risk severe anemia.', 26));
  } else if (hb != null && hb < 11) {
    risk = maxSeverity(risk, 'MEDIUM');
    points += 8;
    alerts.push(withAiMeta({
      alert_type: 'anemia',
      severity: 'MEDIUM',
      title: 'Mild anemia detected',
      message: `Hemoglobin ${hb} g/dL.`,
      recommended_actions: ['Iron and folate', 'Nutrition counseling', 'Repeat Hb next visit'],
    }, 'Mild anemia (Hb <11) increases Medium Risk.', 8));
  }

  if (danger.headache && danger.blurred_vision) {
    risk = maxSeverity(risk, 'CRITICAL');
    points += 20;
    alerts.push(withAiMeta({
      alert_type: 'danger_signs',
      severity: 'CRITICAL',
      title: 'Danger signs — headache with blurred vision',
      message: 'Possible severe preeclampsia features.',
      recommended_actions: ['Immediate doctor review', 'Emergency preparedness'],
    }, 'Combined neurological danger signs require urgent review.', 20));
  }
  if (danger.bleeding || danger.convulsion || danger.severe_pain) {
    risk = maxSeverity(risk, 'CRITICAL');
    points += 24;
    alerts.push(withAiMeta({
      alert_type: 'danger_signs',
      severity: 'CRITICAL',
      title: 'Critical obstetric danger signs',
      message: 'Bleeding, convulsion, and/or severe pain reported.',
      recommended_actions: ['Emergency Mode', 'Stabilize', 'Refer if needed'],
    }, 'Active bleeding / convulsion / severe pain = Critical.', 24));
  }
  if (danger.reduced_fetal_movement || vitals.fetal_movement === 'reduced' || vitals.fetal_movement === 'absent') {
    risk = maxSeverity(risk, 'HIGH');
    points += 12;
    alerts.push(withAiMeta({
      alert_type: 'fetal_wellbeing',
      severity: 'HIGH',
      title: 'Reduced fetal movement',
      message: 'Assess fetal heart rate and consider further evaluation.',
      recommended_actions: ['Confirm FHR', 'Notify doctor', 'Consider referral'],
    }, 'Reduced fetal movement requires prompt assessment.', 12));
  }

  // Gestational diabetes risk (midwife AI clinical alerts)
  const glucose = labs.glucose;
  if (glucose && ['positive', '1+', '2+', '3+'].includes(String(glucose))) {
    risk = maxSeverity(risk, 'HIGH');
    points += 12;
    alerts.push(withAiMeta({
      alert_type: 'gestational_diabetes_risk',
      severity: 'HIGH',
      title: 'Gestational diabetes risk',
      message: `Urine glucose ${glucose} — evaluate for GDM.`,
      recommended_actions: ['Confirm with blood glucose protocol', 'Nutrition counseling', 'Doctor co-management'],
    }, 'Positive urine glucose during ANC raises gestational diabetes risk.', 12));
  }

  // Crude fetal growth concern if fundal height far behind GA (optional signal)
  const fh = vitals.fundal_height_cm != null ? Number(vitals.fundal_height_cm) : null;
  const gaHint = vitals.gestational_age_weeks != null ? Number(vitals.gestational_age_weeks) : null;
  if (fh != null && gaHint != null && gaHint >= 24 && fh < gaHint - 4) {
    risk = maxSeverity(risk, 'MEDIUM');
    points += 8;
    alerts.push(withAiMeta({
      alert_type: 'fetal_growth',
      severity: 'MEDIUM',
      title: 'Possible fetal growth concern',
      message: `Fundal height ${fh} cm vs GA ${gaHint} weeks.`,
      recommended_actions: ['Recheck measurements', 'Assess fetal wellbeing', 'Consider ultrasound / referral'],
    }, 'Fundal height markedly below gestational age may indicate growth restriction.', 8));
  }

  if (obstetric.previous_csection) risk = maxSeverity(risk, 'HIGH');

  const nextVisitDays = risk === 'CRITICAL' ? 3 : risk === 'HIGH' ? 7 : risk === 'MEDIUM' ? 14 : 28;

  return {
    risk_score: risk,
    risk_percent: toPercentScore(risk, points),
    alerts,
    next_visit_days: nextVisitDays,
    sms_stub: {
      template: 'RMDP: Please attend your next ANC visit. Contact your facility if you have danger signs (headache, bleeding, reduced baby movement).',
      channel: 'sms_stub',
    },
    ai_disclaimer: 'AI recommendations require human confirmation. They do not replace clinical judgment or prescribe treatment.',
  };
}

/** Validate mandatory ANC fields — Rule 1.3 / 3.x */
function validateAncVisitMandatory(body = {}) {
  const missing = [];
  const v = body.vitals || {};
  const d = body.danger || {};
  if (v.bp_systolic == null || v.bp_systolic === '') missing.push('Blood pressure (systolic)');
  if (v.bp_diastolic == null || v.bp_diastolic === '') missing.push('Blood pressure (diastolic)');
  if (v.fetal_heart_rate == null || v.fetal_heart_rate === '') missing.push('Fetal heart rate');
  if (body.gestational_age_weeks == null && body.lmp == null && !body.ga_confirmed) {
    // GA can come from pregnancy record; caller may set ga_confirmed
  }
  const dangerChecked =
    Object.prototype.hasOwnProperty.call(d, 'headache') ||
    Object.prototype.hasOwnProperty.call(d, 'blurred_vision') ||
    Object.prototype.hasOwnProperty.call(d, 'bleeding') ||
    body.danger_assessment_done;
  if (!dangerChecked) missing.push('Danger sign assessment');

  if (missing.length) {
    return {
      ok: false,
      error: 'Required clinical information incomplete.',
      missing,
    };
  }
  return { ok: true };
}

function validateLaborAdmission(body = {}) {
  const missing = [];
  if (!body.pregnancy_id) missing.push('Maternal identity / pregnancy');
  if (body.presentation == null || body.presentation === '') missing.push('Fetal presentation');
  if (body.fhr == null || body.fhr === '') missing.push('Initial fetal heart rate');
  if (body.bp_systolic == null || body.bp_diastolic == null) missing.push('Initial vital signs (BP)');
  if (body.cervical_dilation == null || body.cervical_dilation === '') missing.push('Cervical dilation');
  if (missing.length) {
    return { ok: false, error: 'Required clinical information incomplete.', missing };
  }
  return { ok: true };
}

function validateDelivery(body = {}) {
  const missing = [];
  if (!body.delivery_method) missing.push('Delivery method');
  if (body.blood_loss_ml == null || body.blood_loss_ml === '') missing.push('Blood loss');
  if (!body.placenta_condition) missing.push('Placenta status');
  const baby = body.baby || {};
  if (baby.birth_weight_g == null || baby.birth_weight_g === '') missing.push('Birth weight');
  if (baby.apgar_1 == null || baby.apgar_1 === '') missing.push('APGAR 1');
  if (baby.apgar_5 == null || baby.apgar_5 === '') missing.push('APGAR 5');
  if (!baby.sex) missing.push('Birth outcome / sex');
  if (missing.length) {
    return { ok: false, error: 'Required clinical information incomplete.', missing };
  }
  return { ok: true };
}

function validatePartographEntry(body = {}) {
  const missing = [];
  if (body.cervical_dilation == null || body.cervical_dilation === '') missing.push('Cervical dilation');
  if (body.fhr == null || body.fhr === '') missing.push('Fetal heart rate');
  if (body.bp_systolic == null || body.bp_diastolic == null) missing.push('Maternal BP');
  if (body.pulse == null || body.pulse === '') missing.push('Pulse');
  if (body.contractions_per_10min == null || body.contractions_per_10min === '') missing.push('Contractions');
  if (missing.length) {
    return { ok: false, error: 'Required clinical information incomplete.', missing };
  }
  return { ok: true };
}

function evaluatePartograph(entries = [], admission = {}, obstetric = {}) {
  const alerts = [];
  let risk = 'LOW';
  let points = 0;
  if (!entries.length) return { risk_score: risk, risk_percent: 15, alerts };

  const latest = entries[entries.length - 1];
  const first = entries[0];

  // Rule 4.3
  if (latest.fhr != null && (latest.fhr < 110 || latest.fhr > 160)) {
    risk = maxSeverity(risk, 'CRITICAL');
    points += 28;
    alerts.push(withAiMeta({
      alert_type: 'fetal_distress',
      severity: 'CRITICAL',
      title: 'Fetal Distress Alert',
      message: `FHR ${latest.fhr} bpm outside 110–160.`,
      recommended_actions: ['Notify doctor', 'Immediate assessment', 'Emergency Mode', 'Prepare for expedited delivery'],
    }, 'Rule 4.3: FHR <110 or >160 bpm indicates fetal distress risk.', 28));
  }

  // Rule 4.4
  if (entries.length >= 2 && first.cervical_dilation != null && latest.cervical_dilation != null) {
    const hours = (new Date(latest.recorded_at) - new Date(first.recorded_at)) / (1000 * 60 * 60);
    const progress = Number(latest.cervical_dilation) - Number(first.cervical_dilation);
    if (hours >= 4 && progress < 1) {
      risk = maxSeverity(risk, 'HIGH');
      points += 16;
      alerts.push(withAiMeta({
        alert_type: 'prolonged_labor',
        severity: 'HIGH',
        title: 'Possible prolonged labor detected',
        message: `Cervical progress ${progress} cm over ${hours.toFixed(1)} hours.`,
        recommended_actions: ['Alert midwife team', 'Recommend doctor review', 'Reassess for obstruction'],
      }, 'Rule 4.4: Slow cervical progress suggests prolonged labor.', 16));
    }
    if (hours >= 4 && progress < 0.5 && Number(latest.cervical_dilation) < 6) {
      risk = maxSeverity(risk, 'CRITICAL');
      points += 20;
      alerts.push(withAiMeta({
        alert_type: 'obstructed_labor',
        severity: 'CRITICAL',
        title: 'Obstructed labor risk',
        message: 'Very slow progress with incomplete dilation — assess for obstruction.',
        recommended_actions: ['Notify doctor immediately', 'Stop oxytocin if running', 'Prepare C-section / referral'],
      }, 'Markedly arrested labor progress raises obstructed labor risk.', 20));
    }
  }

  if (latest.bp_systolic >= 160 || latest.bp_diastolic >= 110) {
    risk = maxSeverity(risk, 'CRITICAL');
    points += 22;
    alerts.push(withAiMeta({
      alert_type: 'severe_hypertension',
      severity: 'CRITICAL',
      title: 'Severe hypertension in labor',
      message: `BP ${latest.bp_systolic}/${latest.bp_diastolic}.`,
      recommended_actions: ['Notify doctor', 'Emergency review'],
    }, 'Severe BP in labor requires immediate review.', 22));
  } else if (latest.bp_systolic >= 140 || latest.bp_diastolic >= 90) {
    risk = maxSeverity(risk, 'HIGH');
    points += 10;
  }

  if (latest.pulse >= 120 || (latest.temperature != null && latest.temperature >= 38)) {
    risk = maxSeverity(risk, 'HIGH');
    points += 10;
    alerts.push(withAiMeta({
      alert_type: 'maternal_deterioration',
      severity: 'HIGH',
      title: 'Maternal deterioration signs',
      message: 'Tachycardia and/or fever detected.',
      recommended_actions: ['Doctor review', 'Sepsis screen if febrile'],
    }, 'Maternal tachycardia/fever may indicate deterioration.', 10));
  }

  if (obstetric.previous_csection) risk = maxSeverity(risk, 'HIGH');

  return {
    risk_score: risk,
    risk_percent: toPercentScore(risk, points),
    alerts,
    warning_banners: buildLaborWarnings(admission, obstetric),
    ai_disclaimer: 'AI alerts support labor safety. Clinician confirms actions.',
  };
}

function buildLaborWarnings(admission = {}, obstetric = {}) {
  const banners = [];
  if (obstetric.previous_csection) banners.push('Previous C-section');
  if (obstetric.previous_pph) banners.push('Previous PPH');
  if (admission.high_risk) banners.push('High-risk pregnancy');
  return banners;
}

/** Rule 6.2 PPH + Rule 6.3 mental health */
function evaluatePostpartum(assessment = {}) {
  const alerts = [];
  let risk = 'LOW';
  let points = 0;
  const heavyBleed = assessment.bleeding === 'heavy' || assessment.bleeding === 'increased';
  const lowBp =
    (assessment.bp_systolic != null && assessment.bp_systolic < 90) ||
    (assessment.bp_diastolic != null && assessment.bp_diastolic < 60);
  const weakUterus = assessment.uterus_tone === 'boggy' || assessment.uterus_tone === 'atonic';
  const bloodLossMl = assessment.blood_loss_ml != null ? Number(assessment.blood_loss_ml) : null;

  if (heavyBleed || (bloodLossMl != null && bloodLossMl >= 500) || (weakUterus && lowBp) || (heavyBleed && weakUterus)) {
    risk = 'CRITICAL';
    points += 35;
    alerts.push(withAiMeta({
      alert_type: 'pph',
      severity: 'CRITICAL',
      title: 'POSTPARTUM HEMORRHAGE ALERT',
      message: 'Increased blood loss and/or uterine atony with hemodynamic concern.',
      recommended_actions: [
        'Open emergency checklist',
        'Notify doctor',
        'Uterine massage',
        'Oxytocin',
        'IV fluids',
        'Blood request',
        'Record interventions',
      ],
    }, 'Rule 6.2: Heavy bleeding, boggy uterus, or falling BP → PPH alert.', 35));
  }

  let mentalHealthFollowup = false;
  if (assessment.mental_health === 'depressed_signs' || assessment.mood_low || assessment.support_concern) {
    mentalHealthFollowup = true;
    risk = maxSeverity(risk, 'MEDIUM');
    points += 6;
    alerts.push(withAiMeta({
      alert_type: 'postpartum_mental_health',
      severity: 'MEDIUM',
      title: 'Postpartum mental health follow-up recommended',
      message: 'Mood/emotional wellbeing concerns detected during screening.',
      recommended_actions: ['Recommend mental health follow-up', 'Ensure social support', 'Document plan'],
    }, 'Rule 6.3: Depression screening positive → mental health follow-up.', 6));
  }

  // Infection risk — fever postpartum
  if (assessment.temperature != null && Number(assessment.temperature) >= 38) {
    risk = maxSeverity(risk, 'HIGH');
    points += 14;
    alerts.push(withAiMeta({
      alert_type: 'postpartum_infection',
      severity: 'HIGH',
      title: 'Postpartum infection risk',
      message: `Temperature ${assessment.temperature}°C — screen for puerperal sepsis.`,
      recommended_actions: ['Notify doctor', 'Sepsis screen', 'Antibiotics per protocol', 'Increase monitoring'],
    }, 'Postpartum fever raises infection / sepsis risk.', 14));
  }

  // Hypertension complications postpartum
  if (
    (assessment.bp_systolic != null && assessment.bp_systolic >= 140) ||
    (assessment.bp_diastolic != null && assessment.bp_diastolic >= 90)
  ) {
    risk = maxSeverity(risk, 'HIGH');
    points += 10;
    alerts.push(withAiMeta({
      alert_type: 'postpartum_hypertension',
      severity: 'HIGH',
      title: 'Postpartum hypertension complication',
      message: `BP ${assessment.bp_systolic}/${assessment.bp_diastolic} — monitor for complications.`,
      recommended_actions: ['Recheck BP', 'Watch for headache/visual changes', 'Notify doctor if severe'],
    }, 'Elevated BP after delivery may signal hypertensive complications.', 10));
  }

  return {
    risk_score: risk,
    risk_percent: toPercentScore(risk, points),
    alerts,
    pph_suspected: risk === 'CRITICAL' && alerts.some((a) => a.alert_type === 'pph'),
    mental_health_followup: mentalHealthFollowup,
    ai_disclaimer: 'AI supports detection; clinician confirms diagnosis and treatment.',
  };
}

/**
 * AI Clinical Decision Support for doctors.
 * Suggestions only — never replace clinical judgment.
 */
function clinicalDecisionSupport(alert = {}) {
  const type = alert.alert_type || '';
  const map = {
    preeclampsia: {
      possible_diagnosis: 'Severe preeclampsia (probable)',
      explanation: 'High BP with proteinuria (and/or neurological symptoms) strongly suggests preeclampsia spectrum.',
      recommendations: [
        'Immediate obstetric review',
        'Stabilize BP per protocol',
        'Magnesium sulfate if severe features',
        'Plan delivery / referral assessment',
      ],
      similar_pattern: 'BP ≥140/90 + proteinuria ± headache/blurred vision',
      priority: 'CRITICAL',
    },
    severe_hypertension: {
      possible_diagnosis: 'Severe hypertension in pregnancy',
      explanation: 'BP ≥160/110 requires urgent clinical management to prevent stroke and eclampsia.',
      recommendations: ['Immediate BP control', 'Assess for preeclampsia features', 'Continuous monitoring'],
      similar_pattern: 'BP 160/110 with or without symptoms',
      priority: 'CRITICAL',
    },
    hypertension: {
      possible_diagnosis: 'Gestational / pregnancy-induced hypertension',
      explanation: 'Elevated BP ≥140/90 without confirmed severe features.',
      recommendations: ['Recheck BP', 'Urine protein', 'Increase surveillance', 'Counsel danger signs'],
      similar_pattern: 'Isolated elevated BP on ANC visit',
      priority: 'URGENT',
    },
    severe_anemia: {
      possible_diagnosis: 'Severe anemia',
      explanation: 'Hemoglobin <7 g/dL increases maternal morbidity and PPH risk.',
      recommendations: ['Doctor co-management', 'Iron therapy / transfusion readiness', 'Facility birth plan'],
      similar_pattern: 'Hb <7 with fatigue or tachycardia',
      priority: 'CRITICAL',
    },
    fetal_distress: {
      possible_diagnosis: 'Fetal distress',
      explanation: 'Fetal heart rate outside 110–160 bpm indicates compromised fetal wellbeing.',
      recommendations: ['Immediate assessment', 'Intrauterine resuscitation', 'Expedite delivery if indicated'],
      similar_pattern: 'FHR <110 or >160 during labor',
      priority: 'CRITICAL',
    },
    prolonged_labor: {
      possible_diagnosis: 'Prolonged / protracted labor',
      explanation: 'Cervical progress slower than expected suggests dystocia risk.',
      recommendations: ['Doctor review', 'Reassess for obstruction', 'Augmentation or C-section decision'],
      similar_pattern: '<1 cm dilation progress over ≥4 hours',
      priority: 'URGENT',
    },
    obstructed_labor: {
      possible_diagnosis: 'Obstructed labor (risk)',
      explanation: 'Arrested progress with incomplete dilation raises obstruction concern.',
      recommendations: ['Immediate doctor review', 'Prepare C-section / referral', 'Stop oxytocin if running'],
      similar_pattern: 'Arrested labor with maternal/fetal compromise signs',
      priority: 'CRITICAL',
    },
    pph: {
      possible_diagnosis: 'Postpartum hemorrhage',
      explanation: 'Heavy bleeding and/or atonic uterus with hemodynamic change.',
      recommendations: ['Activate PPH checklist', 'Uterotonics', 'IV fluids / blood', 'Surgical readiness'],
      similar_pattern: 'Heavy lochia + boggy uterus ± hypotension',
      priority: 'CRITICAL',
    },
    postpartum_infection: {
      possible_diagnosis: 'Puerperal sepsis / infection',
      explanation: 'Postpartum fever suggests infectious complication until proven otherwise.',
      recommendations: ['Sepsis screen', 'Antibiotics per protocol', 'Source control assessment'],
      similar_pattern: 'Temp ≥38°C after delivery',
      priority: 'URGENT',
    },
    eclampsia: {
      possible_diagnosis: 'Eclampsia',
      explanation: 'Seizure in setting of hypertensive pregnancy disorder.',
      recommendations: ['Airway protection', 'MgSO4', 'BP control', 'Urgent delivery plan'],
      similar_pattern: 'Convulsion + hypertension in pregnancy/postpartum',
      priority: 'CRITICAL',
    },
    gestational_diabetes_risk: {
      possible_diagnosis: 'Gestational diabetes (possible)',
      explanation: 'Positive urine glucose warrants confirmatory testing and metabolic co-management.',
      recommendations: ['Confirm glucose protocol', 'Nutrition counseling', 'Specialist co-management'],
      similar_pattern: 'Glycosuria on ANC lab panel',
      priority: 'REVIEW',
    },
  };

  const cds = map[type] || {
    possible_diagnosis: alert.title || 'Clinical finding requiring review',
    explanation: alert.message || 'AI flagged an abnormal pattern for clinician validation.',
    recommendations: Array.isArray(alert.recommended_actions)
      ? alert.recommended_actions
      : (alert.recommended_actions?.actions || ['Review maternal record', 'Confirm or dismiss AI alert']),
    similar_pattern: type || 'Clinical alert pattern',
    priority: alert.severity === 'CRITICAL' ? 'CRITICAL' : alert.severity === 'HIGH' ? 'URGENT' : 'REVIEW',
  };

  return {
    ...cds,
    disclaimer: 'AI suggestions support decision-making. Final diagnosis and treatment remain with the doctor.',
  };
}

function doctorPriorityRank(item) {
  const p = item.priority || item.severity || '';
  if (p === 'CRITICAL' || p === 'critical') return 1;
  if (p === 'URGENT' || p === 'HIGH' || p === 'urgent') return 2;
  return 3;
}

const EMERGENCY_CHECKLISTS = {
  pph: [
    'Call for help / activate emergency team',
    'Uterine massage',
    'Administer oxytocin',
    'IV fluids',
    'Blood request / crossmatch',
    'Doctor notification',
    'Assess for trauma / retained products',
    'Record outcome',
  ],
  eclampsia: [
    'Protect airway / left lateral position',
    'Give magnesium sulfate per protocol',
    'Control BP',
    'Oxygen if available',
    'Doctor notification',
    'Prepare for referral / delivery plan',
    'Record outcome',
  ],
  sepsis: [
    'Call for help',
    'IV access and fluids',
    'Blood cultures / labs',
    'Broad-spectrum antibiotics',
    'Source control assessment',
    'Doctor notification',
    'Record outcome',
  ],
  obstructed_labor: [
    'Call doctor',
    'Stop oxytocin if running',
    'IV fluids',
    'Bladder catheterization',
    'Prepare for C-section / referral',
    'Continuous FHR monitoring',
    'Record outcome',
  ],
  uterine_rupture: [
    'Emergency team activation',
    'IV fluids / blood',
    'Immediate doctor / surgical readiness',
    'Prepare for laparotomy / referral',
    'Neonatal resuscitation readiness',
    'Record outcome',
  ],
  fetal_distress: [
    'Left lateral position',
    'Stop oxytocin if running',
    'Oxygen if available',
    'Call doctor',
    'Prepare for expedited delivery',
    'Neonatal resuscitation readiness',
    'Record outcome',
  ],
};

const RBAC = {
  midwife: {
    can: ['register_mothers', 'anc', 'labor', 'delivery', 'postpartum', 'refer_request', 'ack_alerts', 'emergency_activate'],
    cannot: ['delete_records', 'change_doctor_decisions', 'national_policy', 'approve_referrals'],
  },
  doctor: {
    can: ['review_alerts', 'approve_referrals', 'manage_emergencies', 'anc', 'labor', 'delivery', 'postpartum'],
    cannot: ['delete_records', 'national_policy'],
  },
  chw: {
    can: ['community_followup', 'risk_report', 'view_assigned'],
    cannot: ['delete_records', 'approve_referrals', 'national_policy', 'modify_doctor_notes'],
  },
  facility_admin: {
    can: ['manage_users', 'facility_reports', 'system_monitoring'],
    cannot: ['modify_clinical_records', 'delete_records'],
  },
  district_officer: {
    can: ['district_analytics', 'facility_comparison'],
    cannot: ['modify_clinical_records', 'delete_records'],
  },
  moh: {
    can: ['national_analytics', 'policy_export'],
    cannot: ['modify_clinical_records', 'delete_records'],
  },
};

module.exports = {
  calcGestationalAgeWeeks,
  calcEDD,
  calcAgeYears,
  scoreRegistrationRisk,
  evaluateAncVisit,
  evaluatePartograph,
  evaluatePostpartum,
  buildLaborWarnings,
  validateAncVisitMandatory,
  validateLaborAdmission,
  validateDelivery,
  validatePartographEntry,
  EMERGENCY_CHECKLISTS,
  RBAC,
  maxSeverity,
  toPercentScore,
  clinicalDecisionSupport,
  doctorPriorityRank,
};
