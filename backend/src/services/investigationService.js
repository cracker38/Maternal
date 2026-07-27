/**
 * Clinical rules for lab & ultrasound result interpretation.
 * Deterministic decision support — clinician confirms all alerts.
 */

function evaluateLabResult(labs) {
  const alerts = [];
  const flags = [];

  const hb = labs.hemoglobin != null && labs.hemoglobin !== '' ? Number(labs.hemoglobin) : null;
  if (hb != null && !Number.isNaN(hb)) {
    if (hb < 7) {
      flags.push('severe_anemia');
      alerts.push({
        alert_type: 'severe_anemia',
        severity: 'CRITICAL',
        title: 'Severe anemia (lab)',
        message: `Hemoglobin ${hb} g/dL — severe anemia. Urgent evaluation and treatment required.`,
        recommended_actions: ['Transfuse / treat urgently', 'Investigate cause', 'Consider referral'],
        explanation: 'Hb < 7 g/dL meets severe anemia criteria in pregnancy.',
        risk_points: 25,
      });
    } else if (hb < 11) {
      flags.push('anemia');
      alerts.push({
        alert_type: 'anemia',
        severity: 'HIGH',
        title: 'Anemia (lab)',
        message: `Hemoglobin ${hb} g/dL — below pregnancy threshold.`,
        recommended_actions: ['Start / optimize iron + folate', 'Dietary counseling', 'Repeat Hb'],
        explanation: 'Hb < 11 g/dL indicates anemia in pregnancy.',
        risk_points: 10,
      });
    }
  }

  if (labs.hiv_result === 'positive') {
    flags.push('hiv_positive');
    alerts.push({
      alert_type: 'hiv_positive',
      severity: 'HIGH',
      title: 'HIV positive (lab)',
      message: 'HIV result positive. Link to care and PMTCT pathway.',
      recommended_actions: ['Confirm per national algorithm', 'Start / continue ART', 'PMTCT counseling'],
      explanation: 'Positive HIV requires same-day linkage and maternal–infant pathway.',
      risk_points: 15,
    });
  }

  if (labs.syphilis_result === 'positive') {
    flags.push('syphilis_positive');
    alerts.push({
      alert_type: 'syphilis_positive',
      severity: 'HIGH',
      title: 'Syphilis positive (lab)',
      message: 'Syphilis / RPR reactive. Treat mother and plan newborn follow-up.',
      recommended_actions: ['Treat per national STI guidelines', 'Partner notification', 'Document treatment'],
      explanation: 'Untreated syphilis risks stillbirth and congenital infection.',
      risk_points: 15,
    });
  }

  if (labs.hepatitis_b === 'positive') {
    flags.push('hepatitis_b_positive');
    alerts.push({
      alert_type: 'hepatitis_b',
      severity: 'MEDIUM',
      title: 'Hepatitis B positive (lab)',
      message: 'HBsAg positive. Plan newborn immunoprophylaxis and specialist review.',
      recommended_actions: ['Notify delivery team', 'Newborn Hep B vaccine + HBIG if indicated'],
      explanation: 'Maternal HBsAg+ requires perinatal prevention measures.',
      risk_points: 8,
    });
  }

  if (labs.malaria_result === 'positive') {
    flags.push('malaria_positive');
    alerts.push({
      alert_type: 'malaria',
      severity: 'HIGH',
      title: 'Malaria positive (lab)',
      message: 'Malaria test positive in pregnancy. Treat promptly with approved regimen.',
      recommended_actions: ['Treat per national malaria-in-pregnancy protocol', 'Monitor mother and fetus'],
      explanation: 'Malaria in pregnancy increases anemia, preterm birth, and fetal risk.',
      risk_points: 12,
    });
  }

  if (['2+', '3+'].includes(labs.urine_protein)) {
    flags.push('proteinuria');
    alerts.push({
      alert_type: 'proteinuria',
      severity: 'HIGH',
      title: 'Significant proteinuria (lab)',
      message: `Urine protein ${labs.urine_protein}. Assess for preeclampsia with BP and symptoms.`,
      recommended_actions: ['Check BP and danger signs', 'Consider preeclampsia workup', 'Escalate if hypertensive'],
      explanation: 'Protein ≥2+ with hypertension suggests preeclampsia.',
      risk_points: 12,
    });
  }

  if (labs.urine_glucose === 'positive' || (labs.blood_glucose != null && Number(labs.blood_glucose) >= 140)) {
    flags.push('glucose_abnormal');
    alerts.push({
      alert_type: 'gestational_diabetes_risk',
      severity: 'MEDIUM',
      title: 'Abnormal glucose (lab)',
      message: 'Glucose screening abnormal. Evaluate for gestational diabetes.',
      recommended_actions: ['Confirm with OGTT / fasting glucose', 'Dietary counseling', 'Monitor'],
      explanation: 'Glycosuria or elevated blood glucose warrants GDM evaluation.',
      risk_points: 8,
    });
  }

  return { flags, alerts };
}

function evaluateUltrasound(us) {
  const alerts = [];
  const flags = [];

  if (us.fetal_heart_activity === 'absent') {
    flags.push('no_fhr');
    alerts.push({
      alert_type: 'fetal_demise_suspected',
      severity: 'CRITICAL',
      title: 'No fetal heart activity (ultrasound)',
      message: 'Fetal heart activity absent on ultrasound. Urgent clinical confirmation required.',
      recommended_actions: ['Confirm with second observer / Doppler', 'Counsel family', 'Escalate to doctor'],
      explanation: 'Absent FHR on ultrasound is a critical finding needing immediate confirmation.',
      risk_points: 30,
    });
  }

  if (us.placenta_location === 'previa' || us.placenta_location === 'low_lying') {
    flags.push('placenta_previa_risk');
    alerts.push({
      alert_type: 'placenta_previa',
      severity: us.placenta_location === 'previa' ? 'CRITICAL' : 'HIGH',
      title: us.placenta_location === 'previa' ? 'Placenta previa (ultrasound)' : 'Low-lying placenta (ultrasound)',
      message: `Placenta reported as ${us.placenta_location.replace(/_/g, ' ')}. Plan facility birth and bleeding precautions.`,
      recommended_actions: ['Avoid digital exam if bleeding', 'Facility-based delivery plan', 'Counsel on bleeding danger signs'],
      explanation: 'Previal / low-lying placenta increases antepartum hemorrhage risk.',
      risk_points: us.placenta_location === 'previa' ? 25 : 15,
    });
  }

  if (us.amniotic_fluid === 'oligohydramnios') {
    flags.push('oligohydramnios');
    alerts.push({
      alert_type: 'oligohydramnios',
      severity: 'HIGH',
      title: 'Oligohydramnios (ultrasound)',
      message: 'Reduced amniotic fluid. Evaluate fetal wellbeing and consider referral.',
      recommended_actions: ['Assess fetal growth and Doppler if available', 'Review for PROM / IUGR', 'Consider specialist review'],
      explanation: 'Oligohydramnios is associated with placental insufficiency and adverse outcomes.',
      risk_points: 12,
    });
  }

  if (us.amniotic_fluid === 'polyhydramnios') {
    flags.push('polyhydramnios');
    alerts.push({
      alert_type: 'polyhydramnios',
      severity: 'MEDIUM',
      title: 'Polyhydramnios (ultrasound)',
      message: 'Increased amniotic fluid. Screen for GDM and fetal anomalies.',
      recommended_actions: ['Glucose screening', 'Detailed anomaly review', 'Monitor for preterm labor'],
      explanation: 'Polyhydramnios may indicate GDM, anomalies, or idiopathic excess fluid.',
      risk_points: 8,
    });
  }

  if (us.presentation === 'breech' || us.presentation === 'transverse') {
    flags.push('malpresentation');
    alerts.push({
      alert_type: 'malpresentation',
      severity: 'MEDIUM',
      title: `Malpresentation: ${us.presentation} (ultrasound)`,
      message: `Fetal presentation is ${us.presentation}. Plan delivery mode with doctor.`,
      recommended_actions: ['Discuss ECV eligibility if breech at term', 'Facility delivery plan', 'Avoid home birth'],
      explanation: 'Non-cephalic presentation may require assisted or cesarean birth.',
      risk_points: 8,
    });
  }

  if (us.fetal_number && us.fetal_number !== 'singleton') {
    flags.push('multiple_pregnancy');
    alerts.push({
      alert_type: 'multiple_pregnancy',
      severity: 'HIGH',
      title: `Multiple pregnancy: ${us.fetal_number} (ultrasound)`,
      message: 'Multiple gestation confirmed. High-risk ANC and facility delivery required.',
      recommended_actions: ['High-risk ANC pathway', 'Specialist / hospital plan', 'Closer visit schedule'],
      explanation: 'Twins/higher-order multiples increase preterm and maternal complication risk.',
      risk_points: 15,
    });
  }

  if (us.fetal_anomalies && String(us.fetal_anomalies).trim()) {
    flags.push('fetal_anomaly');
    alerts.push({
      alert_type: 'fetal_anomaly',
      severity: 'HIGH',
      title: 'Possible fetal anomaly (ultrasound)',
      message: 'Anomaly or concerning finding documented. Specialist review recommended.',
      recommended_actions: ['Refer for detailed scan / specialist', 'Counsel family', 'Document carefully'],
      explanation: us.fetal_anomalies,
      risk_points: 12,
    });
  }

  return { flags, alerts };
}

module.exports = {
  evaluateLabResult,
  evaluateUltrasound,
};
