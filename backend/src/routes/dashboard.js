const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { getScope, facilityColumnScope, pregnancyScopeSql } = require('../utils/scope');
const { getFleetSummary, getActiveDispatches } = require('../services/ambulanceService');

const router = express.Router();

function num(v) {
  return Number(v) || 0;
}

function contextOf(req, scope) {
  return {
    role: scope.role,
    scope: scope.level,
    facility_id: scope.facilityId,
    facility_name: req.user.facility_name || null,
    district: scope.district || req.user.district || null,
    user_name: req.user.full_name,
    user_id: scope.userId,
  };
}

router.get('/', authenticate, async (req, res) => {
  try {
    const scope = getScope(req.user);
    const role = scope.role;
    const ctx = contextOf(req, scope);

    const pScope = pregnancyScopeSql(scope);
    const aScope = facilityColumnScope(scope, 'a.facility_id');
    const eScope = facilityColumnScope(scope, 'e.facility_id');
    const rScope = facilityColumnScope(scope, 'r.from_facility_id');
    const ftScope = facilityColumnScope(scope, 'ft.facility_id');
    const dScope = facilityColumnScope(scope, 'd.facility_id');
    const avScope = facilityColumnScope(scope, 'av.facility_id');

    // ---- Shared activity counts ----
    const [[waiting]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM pregnancies p WHERE p.status = 'anc' ${pScope.sql}`,
      pScope.params
    );
    const [[ancToday]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM anc_visits av WHERE date(av.visit_date) = date('now') ${avScope.sql}`,
      avScope.params
    );
    const [[laborCount]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM pregnancies p WHERE p.status = 'labor' ${pScope.sql}`,
      pScope.params
    );
    const [[deliveriesToday]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM deliveries d WHERE date(d.delivery_time) = date('now') ${dScope.sql}`,
      dScope.params
    );
    const [[expectedDelivery]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM pregnancies p
       WHERE p.status IN ('anc','labor') AND p.edd BETWEEN date('now') AND date('now','+7 days')
       ${pScope.sql}`,
      pScope.params
    );
    const [[ppnDue]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM pregnancies p WHERE p.status = 'postpartum' ${pScope.sql}`,
      pScope.params
    );
    const [[followupPending]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM followup_tasks ft WHERE ft.status IN ('pending','in_progress') ${ftScope.sql}`,
      ftScope.params
    );

    const today = {
      mothers_waiting: num(waiting.c),
      anc_appointments: num(ancToday.c),
      labor_admissions: num(laborCount.c),
      deliveries_completed: num(deliveriesToday.c),
      deliveries_expected: num(expectedDelivery.c),
      postpartum_reviews_due: num(ppnDue.c),
      followups_pending: num(followupPending.c),
    };

    // ---- Risk mothers with factors ----
    const [riskMothers] = await pool.execute(
      `SELECT p.id, p.anc_number, p.risk_score, p.risk_percent, p.status, p.gestational_age_weeks, p.hiv_status,
              m.full_name, m.phone,
              oh.previous_csection, oh.previous_pph, oh.previous_eclampsia,
              mh.hypertension AS chron_htn, mh.hiv, mh.diabetes
       FROM pregnancies p
       JOIN mothers m ON m.id = p.mother_id
       LEFT JOIN obstetric_history oh ON oh.pregnancy_id = p.id
       LEFT JOIN medical_history mh ON mh.pregnancy_id = p.id
       WHERE p.status IN ('anc','labor','postpartum') AND p.risk_score IN ('CRITICAL','HIGH','MEDIUM')
       ${pScope.sql}
       ORDER BY CASE p.risk_score WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END LIMIT 30`,
      pScope.params
    );

    const enrichRisk = (rows) =>
      rows.map((r) => {
        const factors = [];
        if (r.chron_htn) factors.push('Hypertension');
        if (r.previous_csection) factors.push('Previous C-section');
        if (r.previous_pph) factors.push('Previous PPH');
        if (r.previous_eclampsia) factors.push('Previous eclampsia');
        if (r.hiv || r.hiv_status === 'positive') factors.push('HIV positive');
        return { ...r, risk_factors: factors };
      });

    // ---- Labor ward panel ----
    const [laborWard] = await pool.execute(
      `SELECT p.id AS pregnancy_id, p.anc_number, p.risk_score, m.full_name,
              la.id AS labor_id, la.admission_time, la.cervical_dilation, la.fhr, la.bp_systolic, la.bp_diastolic, la.status,
              pe.fhr AS last_fhr, pe.bp_systolic AS last_bp_sys, pe.bp_diastolic AS last_bp_dia,
              pe.cervical_dilation AS last_dilation, pe.recorded_at AS last_obs_at,
              CAST((julianday('now') - julianday(la.admission_time)) * 24 AS INTEGER) AS labor_hours
       FROM labor_admissions la
       JOIN pregnancies p ON p.id = la.pregnancy_id
       JOIN mothers m ON m.id = p.mother_id
       LEFT JOIN partograph_entries pe ON pe.id = (
         SELECT pe2.id FROM partograph_entries pe2
         WHERE pe2.labor_admission_id = la.id ORDER BY pe2.recorded_at DESC LIMIT 1
       )
       WHERE la.status = 'active' ${facilityColumnScope(scope, 'la.facility_id').sql}
       ORDER BY la.admission_time ASC`,
      facilityColumnScope(scope, 'la.facility_id').params
    );

    const laborPanel = laborWard.map((l) => {
      const fhr = l.last_fhr ?? l.fhr;
      const dil = l.last_dilation ?? l.cervical_dilation;
      let status = 'Normal';
      if (fhr != null && (fhr < 110 || fhr > 160)) status = 'Fetal distress risk';
      else if (num(l.labor_hours) >= 12) status = 'Prolonged labor';
      else if (['HIGH', 'CRITICAL'].includes(l.risk_score)) status = 'High-risk labor';
      return {
        pregnancy_id: l.pregnancy_id,
        labor_id: l.labor_id,
        full_name: l.full_name,
        anc_number: l.anc_number,
        labor_hours: num(l.labor_hours),
        cervical_dilation: dil,
        fhr,
        bp: l.last_bp_sys != null ? `${l.last_bp_sys}/${l.last_bp_dia}` : (l.bp_systolic != null ? `${l.bp_systolic}/${l.bp_diastolic}` : null),
        last_obs_at: l.last_obs_at,
        status_label: status,
        risk_score: l.risk_score,
      };
    });

    // ---- Alerts ----
    const [alerts] = await pool.execute(
      `SELECT a.id, a.pregnancy_id, a.alert_type, a.severity, a.title, a.message, a.status, a.created_at,
              a.recommended_actions, m.full_name, p.anc_number
       FROM alerts a
       JOIN pregnancies p ON p.id = a.pregnancy_id
       JOIN mothers m ON m.id = p.mother_id
       WHERE a.status = 'active' ${aScope.sql}
       ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END, a.created_at DESC LIMIT 25`,
      aScope.params
    );

    const [emergencies] = await pool.execute(
      `SELECT e.id, e.pregnancy_id, e.emergency_type, e.status, e.activated_at, m.full_name, p.anc_number
       FROM emergencies e
       JOIN pregnancies p ON p.id = e.pregnancy_id
       JOIN mothers m ON m.id = p.mother_id
       WHERE e.status IN ('active','stabilized') ${eScope.sql}
       ORDER BY e.activated_at DESC LIMIT 30`,
      eScope.params
    );

    const emergencyCounts = {
      pph: emergencies.filter((e) => e.emergency_type === 'pph').length,
      eclampsia: emergencies.filter((e) => e.emergency_type === 'eclampsia').length,
      fetal_distress: emergencies.filter((e) => e.emergency_type === 'fetal_distress').length,
      sepsis: emergencies.filter((e) => e.emergency_type === 'sepsis').length,
      obstructed_labor: emergencies.filter((e) => e.emergency_type === 'obstructed_labor').length,
      active: emergencies.filter((e) => e.status === 'active').length,
      total: emergencies.length,
    };

    const [referrals] = await pool.execute(
      `SELECT r.id, r.pregnancy_id, r.to_facility_name, r.reason, r.clinical_summary, r.vital_signs,
              r.treatment_provided, r.urgency, r.status, r.created_at,
              m.full_name, p.anc_number, p.risk_score
       FROM referrals r
       JOIN pregnancies p ON p.id = r.pregnancy_id
       JOIN mothers m ON m.id = p.mother_id
       WHERE r.status = 'pending' ${rScope.sql}
       ORDER BY CASE r.urgency WHEN 'emergency' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, r.created_at DESC LIMIT 20`,
      rScope.params
    );

    // ---- Follow-up / CHW ----
    let taskSql = `
      SELECT ft.*, m.full_name, m.phone, m.village, p.anc_number, p.risk_score
      FROM followup_tasks ft
      JOIN pregnancies p ON p.id = ft.pregnancy_id
      JOIN mothers m ON m.id = p.mother_id
      WHERE ft.status IN ('pending','in_progress')`;
    const taskParams = [];
    if (role === 'chw') {
      taskSql += ' AND ft.assigned_to = ?';
      taskParams.push(scope.userId);
    } else {
      taskSql += ftScope.sql;
      taskParams.push(...ftScope.params);
    }
    taskSql += ' ORDER BY ft.due_date ASC LIMIT 40';
    const [tasks] = await pool.execute(taskSql, taskParams);

    const visitsToday = {
      planned: tasks.filter((t) => t.due_date && String(t.due_date).slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    };

    const [[completedToday]] = await pool.execute(
      `SELECT COUNT(*) AS c FROM followup_tasks ft
       WHERE ft.status = 'completed' AND date(ft.completed_at) = date('now')
       ${role === 'chw' ? 'AND ft.assigned_to = ?' : ftScope.sql}`,
      role === 'chw' ? [scope.userId] : ftScope.params
    );
    visitsToday.completed = num(completedToday.c);

    const missedAnc = tasks.filter((t) => t.task_type === 'missed_anc');
    const missedPnc = tasks.filter((t) => ['missed_pnc_day7', 'missed_pnc_day42'].includes(t.task_type));

    // ---- Performance (role-aware) ----
    let performance = {};

    if (role === 'midwife') {
      const midwifeFac = facilityColumnScope(scope, 'p.facility_id');
      const [[mothersManaged]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM pregnancies p WHERE p.registered_by = ? ${midwifeFac.sql}`,
        [scope.userId, ...midwifeFac.params]
      );
      const [[ancDone]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM anc_visits av WHERE av.conducted_by = ? ${avScope.sql}`,
        [scope.userId, ...avScope.params]
      );
      const [[delAttended]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM deliveries d WHERE d.conducted_by = ? ${dScope.sql}`,
        [scope.userId, ...dScope.params]
      );
      const [[emHandled]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM emergencies e WHERE e.activated_by = ? ${eScope.sql}`,
        [scope.userId, ...eScope.params]
      );
      const [[fuDone]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM followup_tasks ft WHERE ft.status = 'completed' ${ftScope.sql}`,
        ftScope.params
      );
      performance = {
        mothers_managed: num(mothersManaged.c),
        anc_completed: num(ancDone.c),
        deliveries_attended: num(delAttended.c),
        emergencies_handled: num(emHandled.c),
        followups_completed: num(fuDone.c),
      };
    } else if (role === 'doctor') {
      const [[reviewed]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM alerts a WHERE a.status = 'acknowledged' AND a.created_by IS NOT NULL ${aScope.sql}`,
        aScope.params
      );
      const [[emManaged]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM emergencies e WHERE e.status IN ('stabilized','resolved') ${eScope.sql}`,
        eScope.params
      );
      const [[refApproved]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM referrals r WHERE r.status = 'accepted' AND r.approved_by = ? ${rScope.sql}`,
        [scope.userId, ...rScope.params]
      );
      performance = {
        cases_reviewed: num(reviewed.c),
        emergencies_managed: num(emManaged.c),
        referrals_approved: num(refApproved.c),
        pending_reviews: alerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length,
      };
    }

    // ---- Admin / district / national extras ----
    let facilityOverview = null;
    let dataQuality = null;
    let systemMonitoring = null;

    if (role === 'facility_admin' || role === 'district_officer' || role === 'moh') {
      const [[totalPreg]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM pregnancies p WHERE 1=1 ${pScope.sql}`,
        pScope.params
      );
      const [[totalAnc]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM anc_visits av WHERE 1=1 ${avScope.sql}`,
        avScope.params
      );
      const [[totalDel]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM deliveries d WHERE 1=1 ${dScope.sql}`,
        dScope.params
      );
      const [[totalEm]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM emergencies e WHERE 1=1 ${eScope.sql}`,
        eScope.params
      );
      const [[totalRef]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM referrals r WHERE 1=1 ${rScope.sql}`,
        rScope.params
      );
      facilityOverview = {
        registered_mothers: num(totalPreg.c),
        anc_visits: num(totalAnc.c),
        deliveries: num(totalDel.c),
        emergencies: num(totalEm.c),
        referrals: num(totalRef.c),
      };

      const [[incomplete]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM pregnancies p
         LEFT JOIN obstetric_history oh ON oh.pregnancy_id = p.id
         WHERE oh.id IS NULL ${pScope.sql}`,
        pScope.params
      );
      const [[noNextVisit]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM anc_visits av
         JOIN (
           SELECT pregnancy_id, MAX(id) AS mid FROM anc_visits GROUP BY pregnancy_id
         ) latest ON latest.mid = av.id
         JOIN pregnancies p ON p.id = av.pregnancy_id
         WHERE av.next_visit_date IS NULL AND p.status = 'anc' ${pScope.sql}`,
        pScope.params
      );
      dataQuality = {
        missing_obstetric_history: num(incomplete.c),
        missing_next_visit: num(noNextVisit.c),
        delayed_documentation: num(followupPending.c),
      };
    }

    if (role === 'facility_admin') {
      const [[logins]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM audit_logs WHERE facility_id = ? AND action = 'login' AND date(created_at) = date('now')`,
        [scope.facilityId]
      );
      const [[actions]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM audit_logs WHERE facility_id = ? AND date(created_at) = date('now')`,
        [scope.facilityId]
      );
      const [recentSecurity] = await pool.execute(
        `SELECT action, created_at, user_id FROM audit_logs
         WHERE facility_id = ? AND action IN ('login','logout','reset_password','create_user','update_user','facility_config')
         ORDER BY created_at DESC LIMIT 10`,
        [scope.facilityId]
      );
      const [staffWorkload] = await pool.execute(
        `SELECT u.id, u.full_name, u.role,
                (SELECT COUNT(*) FROM anc_visits av WHERE av.conducted_by = u.id AND av.visit_date >= date('now','-7 days')) AS anc_7d,
                (SELECT COUNT(*) FROM audit_logs a WHERE a.user_id = u.id AND date(a.created_at) = date('now')) AS actions_today
         FROM users u
         WHERE u.facility_id = ? AND u.is_active = 1 AND u.role IN ('midwife','doctor','chw')
         ORDER BY u.role, u.full_name`,
        [scope.facilityId]
      );
      const [[dupPhones]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM (
           SELECT m.phone FROM mothers m
           JOIN pregnancies p ON p.mother_id = m.id
           WHERE m.phone IS NOT NULL AND m.phone <> '' AND p.facility_id = ?
           GROUP BY m.phone HAVING COUNT(DISTINCT m.id) > 1
         ) d`,
        [scope.facilityId]
      );
      const [[missingPhone]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM pregnancies p
         JOIN mothers m ON m.id = p.mother_id
         WHERE p.facility_id = ? AND p.status IN ('anc','labor','postpartum')
           AND (m.phone IS NULL OR m.phone = '')`,
        [scope.facilityId]
      );
      const [[incompleteAnc]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM anc_visits av
         LEFT JOIN anc_vitals v ON v.anc_visit_id = av.id
         WHERE av.facility_id = ?
           AND (v.bp_systolic IS NULL OR av.next_visit_date IS NULL)`,
        [scope.facilityId]
      );

      systemMonitoring = {
        availability: 'Online',
        sync_status: 'Local MySQL synchronized',
        logins_today: num(logins.c),
        user_activities_today: num(actions.c),
        recent_security: recentSecurity,
        staff_workload: staffWorkload.map((s) => ({
          id: s.id,
          full_name: s.full_name,
          role: s.role,
          anc_visits_7d: num(s.anc_7d),
          actions_today: num(s.actions_today),
        })),
      };

      dataQuality = {
        ...dataQuality,
        missing_patient_phone: num(missingPhone.c),
        possible_duplicate_phones: num(dupPhones.c),
        incomplete_clinical_forms: num(incompleteAnc.c),
      };
    }

    // Facility comparison for DHO/MoH
    let byFacility = [];
    if (role === 'district_officer' || role === 'moh') {
      const facParams = [];
      let facWhere = 'WHERE 1=1';
      if (role === 'district_officer' && scope.district) {
        facWhere += ' AND f.district = ?';
        facParams.push(scope.district);
      }
      const [facRows] = await pool.execute(
        `SELECT f.id, f.name, f.district,
                COUNT(DISTINCT p.id) AS pregnancies,
                SUM(CASE WHEN p.status = 'labor' THEN 1 ELSE 0 END) AS in_labor,
                SUM(CASE WHEN p.risk_score IN ('HIGH','CRITICAL') THEN 1 ELSE 0 END) AS high_risk,
                (SELECT COUNT(*) FROM deliveries d WHERE d.facility_id = f.id) AS deliveries,
                (SELECT COUNT(*) FROM emergencies e WHERE e.facility_id = f.id) AS emergencies,
                (SELECT COUNT(*) FROM referrals r WHERE r.from_facility_id = f.id) AS referrals
         FROM facilities f
         LEFT JOIN pregnancies p ON p.facility_id = f.id
         ${facWhere}
         GROUP BY f.id, f.name, f.district
         ORDER BY pregnancies DESC`,
        facParams
      );
      byFacility = facRows.map((f) => ({
        id: num(f.id),
        name: f.name,
        district: f.district,
        pregnancies: num(f.pregnancies),
        in_labor: num(f.in_labor),
        high_risk: num(f.high_risk),
        deliveries: num(f.deliveries),
        emergencies: num(f.emergencies),
        referrals: num(f.referrals),
      }));
    }

    const riskGrouped = {
      critical: enrichRisk(riskMothers.filter((r) => r.risk_score === 'CRITICAL')),
      high: enrichRisk(riskMothers.filter((r) => r.risk_score === 'HIGH')),
      medium: enrichRisk(riskMothers.filter((r) => r.risk_score === 'MEDIUM')),
    };

    const severeAnemia = alerts.filter((a) => a.alert_type === 'severe_anemia');
    const hypertension = alerts.filter((a) => ['hypertension', 'preeclampsia'].includes(a.alert_type));

    // Role-specific response shaping
    const base = { context: ctx, today };
    if (scope.facilityId) {
      const fleet = await getFleetSummary(scope.facilityId);
      const activeDispatches = await getActiveDispatches(scope.facilityId);
      base.ambulance = {
        summary: fleet.summary,
        fleet: fleet.fleet,
        active_dispatches: activeDispatches.slice(0, 6),
      };
    }

    if (role === 'midwife') {
      // ANC caseload — mothers midwife manages through pregnancy
      const [ancCaseload] = await pool.execute(
        `SELECT p.id, p.anc_number, p.risk_score, p.risk_percent, p.gestational_age_weeks, p.edd, p.status,
                m.full_name, m.phone, m.date_of_birth,
                av.next_visit_date, av.visit_number AS last_visit_number, av.visit_date AS last_visit_date
         FROM pregnancies p
         JOIN mothers m ON m.id = p.mother_id
         LEFT JOIN anc_visits av ON av.id = (
           SELECT av2.id FROM anc_visits av2 WHERE av2.pregnancy_id = p.id ORDER BY av2.visit_number DESC LIMIT 1
         )
         WHERE p.status = 'anc' ${pScope.sql}
         ORDER BY CASE p.risk_score WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END, av.next_visit_date ASC
         LIMIT 20`,
        pScope.params
      );

      const [postpartumQueue] = await pool.execute(
        `SELECT p.id, p.anc_number, p.risk_score, m.full_name, m.phone,
                d.delivery_time, d.delivery_method,
                (SELECT COUNT(*) FROM postpartum_assessments pa WHERE pa.pregnancy_id = p.id) AS assessments_done
         FROM pregnancies p
         JOIN mothers m ON m.id = p.mother_id
         LEFT JOIN deliveries d ON d.pregnancy_id = p.id
         WHERE p.status = 'postpartum' ${pScope.sql}
         ORDER BY d.delivery_time DESC LIMIT 15`,
        pScope.params
      );

      // Missing documentation detection (AI workflow assistance)
      const [missingDocs] = await pool.execute(
        `SELECT p.id, p.anc_number, m.full_name,
                CASE
                  WHEN oh.id IS NULL THEN 'Missing obstetric history'
                  WHEN mh.id IS NULL THEN 'Missing medical history'
                  WHEN p.lmp IS NULL AND p.edd IS NULL THEN 'Missing LMP/EDD'
                  WHEN av.id IS NULL AND p.status = 'anc' THEN 'No ANC visit recorded yet'
                  WHEN av.next_visit_date IS NULL AND p.status = 'anc' THEN 'Missing next ANC schedule'
                  ELSE 'Incomplete clinical documentation'
                END AS gap
         FROM pregnancies p
         JOIN mothers m ON m.id = p.mother_id
         LEFT JOIN obstetric_history oh ON oh.pregnancy_id = p.id
         LEFT JOIN medical_history mh ON mh.pregnancy_id = p.id
         LEFT JOIN anc_visits av ON av.id = (
           SELECT av2.id FROM anc_visits av2 WHERE av2.pregnancy_id = p.id ORDER BY av2.id DESC LIMIT 1
         )
         WHERE p.status IN ('anc','labor','postpartum') ${pScope.sql}
           AND (
             oh.id IS NULL OR mh.id IS NULL OR (p.lmp IS NULL AND p.edd IS NULL)
             OR (p.status = 'anc' AND (av.id IS NULL OR av.next_visit_date IS NULL))
           )
         LIMIT 12`,
        pScope.params
      );

      const [[lowCount]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM pregnancies p WHERE p.status IN ('anc','labor','postpartum') AND p.risk_score = 'LOW' ${pScope.sql}`,
        pScope.params
      );
      const [[medCount]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM pregnancies p WHERE p.status IN ('anc','labor','postpartum') AND p.risk_score = 'MEDIUM' ${pScope.sql}`,
        pScope.params
      );
      const [[highCount]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM pregnancies p WHERE p.status IN ('anc','labor','postpartum') AND p.risk_score = 'HIGH' ${pScope.sql}`,
        pScope.params
      );
      const [[critCount]] = await pool.execute(
        `SELECT COUNT(*) AS c FROM pregnancies p WHERE p.status IN ('anc','labor','postpartum') AND p.risk_score = 'CRITICAL' ${pScope.sql}`,
        pScope.params
      );

      const alertPhase = (a) => {
        const t = a.alert_type || '';
        if (['pph', 'postpartum_mental_health', 'postpartum_infection', 'postpartum_hypertension'].includes(t)) {
          return 'postpartum';
        }
        if (['fetal_distress', 'prolonged_labor', 'maternal_deterioration', 'obstructed_labor', 'severe_hypertension'].includes(t)
          && String(a.title || '').toLowerCase().includes('labor')) {
          return 'labor';
        }
        if (['fetal_distress', 'prolonged_labor', 'maternal_deterioration', 'obstructed_labor'].includes(t)) return 'labor';
        return 'anc';
      };

      const alertsByPhase = {
        anc: alerts.filter((a) => alertPhase(a) === 'anc'),
        labor: alerts.filter((a) => alertPhase(a) === 'labor'),
        postpartum: alerts.filter((a) => alertPhase(a) === 'postpartum'),
      };

      const firstCritical = riskMothers.find((r) => r.risk_score === 'CRITICAL');
      const abnormalLabor = laborPanel.find((l) => l.status_label !== 'Normal');
      const ancDueToday = ancCaseload.find((a) => a.next_visit_date && String(a.next_visit_date).slice(0, 10) <= new Date().toISOString().slice(0, 10));
      const firstPostpartum = postpartumQueue[0];
      const firstMissing = missingDocs[0];

      const nextActions = [];
      if (num(critCount.c) > 0 && firstCritical) {
        nextActions.push({
          priority: 1,
          action: 'review_critical',
          label: `Review ${num(critCount.c)} critical-risk mother(s)`,
          path: `/pregnancies/${firstCritical.id}`,
          reason: 'AI risk prediction flagged critical maternal risk',
        });
      }
      if (abnormalLabor) {
        nextActions.push({
          priority: 1,
          action: 'labor_attention',
          label: `Check labor ward — ${abnormalLabor.full_name} (${abnormalLabor.status_label})`,
          path: `/pregnancies/${abnormalLabor.pregnancy_id}/partograph`,
          reason: 'AI labor alerts: fetal distress / prolonged labor / high-risk',
        });
      }
      if (ancDueToday || num(today.anc_appointments) > 0) {
        const target = ancDueToday || ancCaseload[0];
        nextActions.push({
          priority: 2,
          action: 'anc_today',
          label: target
            ? `Complete ANC for ${target.full_name}`
            : 'Complete ANC assessments due today',
          path: target ? `/pregnancies/${target.id}/anc` : '/mothers',
          reason: 'Scheduled ANC visits require vital signs, fetal assessment, and counseling',
        });
      }
      if (firstPostpartum) {
        nextActions.push({
          priority: 2,
          action: 'postpartum',
          label: `Perform postpartum check — ${firstPostpartum.full_name}`,
          path: `/pregnancies/${firstPostpartum.id}/postpartum`,
          reason: 'Postpartum schedule: bleeding, uterus, recovery, breastfeeding, family planning',
        });
      }
      if (missedAnc.length) {
        nextActions.push({
          priority: 3,
          action: 'missed_anc_chw',
          label: `Assign CHW follow-up for ${missedAnc.length} missed ANC`,
          path: '/community',
          reason: 'AI workflow automation: missed visits → community follow-up',
        });
      }
      if (firstMissing) {
        nextActions.push({
          priority: 3,
          action: 'missing_docs',
          label: `Fix documentation — ${firstMissing.full_name}`,
          path: `/pregnancies/${firstMissing.id}`,
          reason: firstMissing.gap || 'AI detected incomplete maternal records',
        });
      }
      nextActions.push({
        priority: 4,
        action: 'register',
        label: 'Register a new pregnant mother',
        path: '/pregnancies/new',
        reason: 'Start maternal journey: profile, obstetric history, risk score',
      });

      const chwAssignments = tasks
        .filter((t) => t.assigned_to || t.task_type === 'missed_anc' || t.task_type === 'home_visit')
        .slice(0, 8)
        .map((t) => ({
          id: t.id,
          pregnancy_id: t.pregnancy_id,
          full_name: t.full_name,
          title: t.title,
          task_type: t.task_type,
          due_date: t.due_date,
          status: t.status,
        }));

      const reminders = tasks
        .filter((t) => t.task_type === 'reminder' || (t.due_date && String(t.due_date).slice(0, 10) <= new Date().toISOString().slice(0, 10)))
        .slice(0, 8);

      return res.json({
        ...base,
        role_profile: {
          title: 'Midwife — Primary Maternal Care Provider',
          purpose: 'Manage the mother journey from pregnancy registration through postpartum follow-up.',
          ai_principle: 'AI provides recommendations, alerts, predictions, and automation. Final clinical decisions remain with the midwife and authorized providers.',
          can: [
            'Register mothers & create maternal profiles',
            'Perform ANC assessments (vitals, fetal, labs, counseling)',
            'Admit labor, run digital partograph, document delivery',
            'Activate emergencies',
            'Postpartum assessments, breastfeeding & family planning',
            'Schedule follow-ups and assign CHW tasks',
          ],
          cannot: [
            'Permanently delete clinical records',
            'Override doctor clinical decisions',
            'Access national policy dashboards',
          ],
        },
        responsibilities: {
          anc: {
            title: 'Antenatal Care (ANC)',
            counts: {
              mothers_in_anc: num(waiting.c),
              visits_today: num(ancToday.c),
              due_followups: missedAnc.length,
            },
            caseload: ancCaseload,
          },
          labor_delivery: {
            title: 'Labor and Delivery',
            counts: {
              active_labor: num(laborCount.c),
              deliveries_today: num(deliveriesToday.c),
              expected_7_days: num(expectedDelivery.c),
            },
            ward: laborPanel,
          },
          postpartum: {
            title: 'Postpartum Care',
            counts: {
              mothers_postpartum: num(ppnDue.c),
              reviews_due: postpartumQueue.filter((m) => num(m.assessments_done) < 3).length,
            },
            queue: postpartumQueue,
          },
        },
        ai_support: {
          risk_prediction: {
            description: 'AI analyzes maternal history, age, prior complications, BP, labs, and pregnancy progress.',
            classification: {
              LOW: num(lowCount.c),
              MEDIUM: num(medCount.c),
              HIGH: num(highCount.c),
              CRITICAL: num(critCount.c),
            },
            priority_mothers: enrichRisk(riskMothers).slice(0, 12),
            disclaimer: 'Risk scores support triage. Clinician confirms final classification.',
          },
          clinical_alerts: {
            description: 'Phase-specific detection: preeclampsia, anemia, fetal distress, PPH, and more.',
            by_phase: alertsByPhase,
            all: alerts,
          },
          workflow: {
            description: 'AI suggests next actions, reminders, CHW follow-up, summaries, and missing documentation.',
            next_actions: nextActions.sort((a, b) => a.priority - b.priority),
            reminders,
            chw_assignments: chwAssignments,
            missing_documentation: missingDocs,
            summaries: [
              {
                label: 'Facility maternal load today',
                text: `${num(waiting.c)} in ANC · ${num(laborCount.c)} in labor · ${num(ppnDue.c)} postpartum · ${alerts.length} active AI alerts`,
              },
              {
                label: 'Risk snapshot',
                text: `Critical ${num(critCount.c)} · High ${num(highCount.c)} · Medium ${num(medCount.c)} · Low ${num(lowCount.c)}`,
              },
            ],
          },
        },
        // Back-compat for older UI/tests
        risk_center: riskGrouped,
        labor_ward: laborPanel,
        ai_alerts: alerts,
        performance,
        quick_actions: true,
      });
    }

    if (role === 'doctor') {
      const { clinicalDecisionSupport, doctorPriorityRank } = require('../services/riskEngine');

      const aiToValidate = alerts
        .filter((a) => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(a.severity))
        .slice(0, 20)
        .map((a) => {
          const cds = clinicalDecisionSupport(a);
          return {
            ...a,
            cds,
            priority_band: cds.priority === 'CRITICAL' ? 'CRITICAL' : cds.priority === 'URGENT' ? 'URGENT' : 'REVIEW',
          };
        })
        .sort((a, b) => doctorPriorityRank(a) - doctorPriorityRank(b));

      const abnormalLabs = alerts.filter((a) =>
        ['severe_anemia', 'anemia', 'gestational_diabetes_risk', 'hypertension', 'preeclampsia', 'severe_hypertension'].includes(a.alert_type)
      );

      const emergencyPriority = emergencies.map((e) => {
        const band =
          e.status === 'active' && ['eclampsia', 'pph', 'uterine_rupture', 'fetal_distress'].includes(e.emergency_type)
            ? 'CRITICAL'
            : e.status === 'active'
              ? 'URGENT'
              : 'REVIEW';
        return {
          ...e,
          priority_band: band,
          cds: clinicalDecisionSupport({ alert_type: e.emergency_type, title: e.emergency_type, severity: band }),
        };
      }).sort((a, b) => doctorPriorityRank({ priority: a.priority_band }) - doctorPriorityRank({ priority: b.priority_band }));

      const priorityQueue = [
        ...emergencyPriority.map((e) => ({
          kind: 'emergency',
          priority_band: e.priority_band,
          id: e.id,
          pregnancy_id: e.pregnancy_id,
          full_name: e.full_name,
          title: `Emergency: ${String(e.emergency_type).replace(/_/g, ' ')}`,
          path: `/emergencies/${e.id}`,
          cds: e.cds,
        })),
        ...aiToValidate
          .filter((a) => a.priority_band === 'CRITICAL')
          .map((a) => ({
            kind: 'ai_alert',
            priority_band: a.priority_band,
            id: a.id,
            pregnancy_id: a.pregnancy_id,
            full_name: a.full_name,
            title: a.title,
            path: `/pregnancies/${a.pregnancy_id}`,
            cds: a.cds,
          })),
        ...referrals
          .filter((r) => r.urgency === 'emergency')
          .map((r) => ({
            kind: 'referral',
            priority_band: 'CRITICAL',
            id: r.id,
            pregnancy_id: r.pregnancy_id,
            full_name: r.full_name,
            title: `Emergency referral → ${r.to_facility_name}`,
            path: `/pregnancies/${r.pregnancy_id}`,
            cds: {
              possible_diagnosis: 'Referral for higher-level care',
              explanation: r.reason || 'Emergency referral awaiting doctor decision',
              recommendations: ['Review history', 'Approve or amend transfer plan', 'Provide transfer instructions'],
              disclaimer: 'Final referral decision remains with the doctor.',
            },
          })),
        ...aiToValidate
          .filter((a) => a.priority_band === 'URGENT')
          .map((a) => ({
            kind: 'ai_alert',
            priority_band: 'URGENT',
            id: a.id,
            pregnancy_id: a.pregnancy_id,
            full_name: a.full_name,
            title: a.title,
            path: `/pregnancies/${a.pregnancy_id}`,
            cds: a.cds,
          })),
        ...referrals
          .filter((r) => r.urgency !== 'emergency')
          .map((r) => ({
            kind: 'referral',
            priority_band: r.urgency === 'urgent' ? 'URGENT' : 'REVIEW',
            id: r.id,
            pregnancy_id: r.pregnancy_id,
            full_name: r.full_name,
            title: `Referral → ${r.to_facility_name}`,
            path: `/pregnancies/${r.pregnancy_id}`,
            cds: {
              possible_diagnosis: 'Referral decision required',
              explanation: r.clinical_summary || r.reason || 'Pending doctor approval',
              recommendations: ['Review patient history', 'Communicate with receiving facility', 'Document transfer instructions'],
              disclaimer: 'Final referral decision remains with the doctor.',
            },
          })),
        ...aiToValidate
          .filter((a) => a.priority_band === 'REVIEW')
          .map((a) => ({
            kind: 'ai_alert',
            priority_band: 'REVIEW',
            id: a.id,
            pregnancy_id: a.pregnancy_id,
            full_name: a.full_name,
            title: a.title,
            path: `/pregnancies/${a.pregnancy_id}`,
            cds: a.cds,
          })),
      ];

      // Deduplicate: one row per kind+pregnancy for emergencies/alerts (keep highest priority)
      const seenKeys = new Set();
      const dedupedQueue = [];
      for (const item of priorityQueue.sort((a, b) => doctorPriorityRank(a) - doctorPriorityRank(b))) {
        const key = item.kind === 'referral'
          ? `referral-${item.id}`
          : `${item.kind}-${item.pregnancy_id}-${item.title}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        dedupedQueue.push(item);
      }

      const exampleCds = clinicalDecisionSupport({
        alert_type: 'preeclampsia',
        title: 'POSSIBLE PREECLAMPSIA ALERT',
        message: 'BP 160/110 + proteinuria + headache',
        severity: 'CRITICAL',
      });

      return res.json({
        ...base,
        role_profile: {
          title: 'Doctor — Clinical Decision Maker',
          purpose: 'Manage complex cases, validate AI recommendations, and provide advanced medical decisions.',
          ai_principle: 'AI provides diagnosis suggestions, risk explanations, and prioritization. Final clinical decisions remain with the doctor.',
          can: [
            'Review high-risk pregnancies and abnormal ANC results',
            'Evaluate and confirm AI-generated alerts',
            'Approve treatment plans and clinical recommendations',
            'Manage eclampsia, severe HTN, PPH, sepsis, obstructed labor',
            'Approve referrals and provide transfer instructions',
          ],
          cannot: [
            'Permanently delete clinical records',
            'Access national policy dashboards as MoH',
          ],
        },
        clinical_review: {
          high_risk: enrichRisk(riskMothers.filter((r) => ['CRITICAL', 'HIGH'].includes(r.risk_score))),
          medium_risk: enrichRisk(riskMothers.filter((r) => r.risk_score === 'MEDIUM')).slice(0, 8),
          abnormal_anc_results: abnormalLabs.slice(0, 12),
          ai_alerts_to_validate: aiToValidate,
        },
        emergency_management: {
          counts: emergencyCounts,
          cases: emergencyPriority,
          types_covered: ['eclampsia', 'severe_hypertension', 'pph', 'sepsis', 'obstructed_labor', 'fetal_distress'],
        },
        referral_management: {
          pending: referrals,
          tracking_steps: ['pending', 'accepted', 'transferred', 'received', 'completed'],
        },
        ai_support: {
          clinical_decision_support: {
            description: 'Possible diagnoses, risk explanations, recommendations, and similar case patterns.',
            example: {
              input: 'BP 160/110 + proteinuria + headache',
              output: exampleCds,
            },
            active_suggestions: aiToValidate.slice(0, 8),
          },
          emergency_prioritization: {
            description: 'AI ranks cases: Critical → Urgent → Review Required so doctors see the most urgent first.',
            bands: {
              CRITICAL: dedupedQueue.filter((p) => p.priority_band === 'CRITICAL').length,
              URGENT: dedupedQueue.filter((p) => p.priority_band === 'URGENT').length,
              REVIEW: dedupedQueue.filter((p) => p.priority_band === 'REVIEW').length,
            },
            queue: dedupedQueue.slice(0, 20),
          },
        },
        // Back-compat for smoke tests / older UI
        emergency_center: { counts: emergencyCounts, cases: emergencyPriority },
        risk_center: riskGrouped,
        decision_queue: {
          lab_reviews: severeAnemia.length + hypertension.length,
          pending_referrals: referrals,
          ai_to_validate: aiToValidate,
          pending_doctor_reviews: num(today.followups_pending),
        },
        clinical_overview: enrichRisk(riskMothers).slice(0, 12),
        performance,
        ai_alerts: alerts,
      });
    }

    if (role === 'chw') {
      const [assignedMothers] = await pool.execute(
        `SELECT DISTINCT p.id, p.anc_number, p.risk_score, p.risk_percent, p.status, p.gestational_age_weeks,
                m.full_name, m.phone, m.village, m.cell_name, m.sector, m.district,
                oh.previous_csection, oh.previous_pph, mh.hypertension AS chron_htn
         FROM followup_tasks ft
         JOIN pregnancies p ON p.id = ft.pregnancy_id
         JOIN mothers m ON m.id = p.mother_id
         LEFT JOIN obstetric_history oh ON oh.pregnancy_id = p.id
         LEFT JOIN medical_history mh ON mh.pregnancy_id = p.id
         WHERE ft.assigned_to = ? AND ft.status IN ('pending','in_progress','completed')
         ORDER BY CASE p.risk_score WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END LIMIT 40`,
        [scope.userId]
      );

      const prioritizeFollowup = (row, kind) => {
        const highRisk = ['HIGH', 'CRITICAL'].includes(row.risk_score);
        const htn = !!row.chron_htn;
        const missed = kind === 'missed_anc' || kind === 'missed_pnc' || String(row.task_type || '').startsWith('missed');
        if (missed && (highRisk || htn)) {
          return {
            band: 'HIGH',
            reason: 'Missed visit + hypertension / high-risk history',
          };
        }
        if (highRisk) {
          return { band: 'HIGH', reason: 'High-risk mother follow-up required' };
        }
        if (missed) {
          return { band: 'MEDIUM', reason: 'Missed routine appointment' };
        }
        return { band: 'MEDIUM', reason: 'Community follow-up scheduled' };
      };

      const followupPriority = [];
      for (const t of tasks) {
        const mother = assignedMothers.find((m) => m.id === t.pregnancy_id) || {};
        const prio = prioritizeFollowup({ ...mother, ...t, risk_score: t.risk_score || mother.risk_score }, t.task_type);
        followupPriority.push({
          task_id: t.id,
          pregnancy_id: t.pregnancy_id,
          full_name: t.full_name,
          phone: t.phone,
          village: t.village,
          anc_number: t.anc_number,
          risk_score: t.risk_score,
          title: t.title,
          task_type: t.task_type,
          due_date: t.due_date,
          status: t.status,
          priority_band: prio.band,
          priority_reason: prio.reason,
        });
      }
      followupPriority.sort((a, b) => (a.priority_band === 'HIGH' ? 0 : 1) - (b.priority_band === 'HIGH' ? 0 : 1));

      // Location risk: villages with missed visits / high-risk assigned mothers
      const villageMap = {};
      for (const m of assignedMothers) {
        const v = m.village || m.cell_name || 'Unknown community';
        if (!villageMap[v]) villageMap[v] = { village: v, mothers: 0, high_risk: 0, missed: 0 };
        villageMap[v].mothers += 1;
        if (['HIGH', 'CRITICAL'].includes(m.risk_score)) villageMap[v].high_risk += 1;
      }
      for (const t of [...missedAnc, ...missedPnc]) {
        const v = t.village || 'Unknown community';
        if (!villageMap[v]) villageMap[v] = { village: v, mothers: 0, high_risk: 0, missed: 0 };
        villageMap[v].missed += 1;
      }
      const locationRisk = Object.values(villageMap)
        .map((v) => ({
          ...v,
          risk_level: v.missed >= 2 || v.high_risk >= 2 ? 'HIGH' : v.missed >= 1 || v.high_risk >= 1 ? 'MEDIUM' : 'LOW',
          trend: v.missed > 0 ? 'Poor follow-up trend' : v.high_risk > 0 ? 'High-risk community' : 'Stable',
        }))
        .sort((a, b) => b.missed + b.high_risk - (a.missed + a.high_risk));

      const education = [
        {
          id: 'nutrition',
          title: 'Nutrition education',
          topic: 'Pregnancy nutrition',
          talking_points: ['Eat iron-rich foods', 'Take iron/folate daily', 'Drink safe water', 'Avoid alcohol'],
          sms: 'RMDP: Eat iron-rich foods and take your iron tablets daily. Visit the health facility if you feel weak.',
        },
        {
          id: 'birth_prep',
          title: 'Birth preparedness',
          topic: 'Facility birth plan',
          talking_points: ['Choose facility birth', 'Save for transport', 'Identify birth companion', 'Know danger signs'],
          sms: 'RMDP: Prepare for a facility birth. Plan transport early and keep your ANC card ready.',
        },
        {
          id: 'danger_signs',
          title: 'Danger sign awareness',
          topic: 'When to seek care immediately',
          talking_points: ['Heavy bleeding', 'Severe headache / blurred vision', 'Reduced baby movement', 'Convulsions', 'Fever'],
          sms: 'RMDP: Seek care NOW for bleeding, severe headache, blurred vision, reduced baby movement, or convulsions.',
        },
        {
          id: 'facility_delivery',
          title: 'Facility delivery awareness',
          topic: 'Why facility birth saves lives',
          talking_points: ['Skilled birth attendant', 'Emergency readiness', 'Newborn care', 'Postpartum checks'],
          sms: 'RMDP: Deliver at a health facility for safer birth and newborn care. Contact your CHW if you need support.',
        },
      ];

      const communicationAssistant = {
        description: 'AI helps generate SMS reminders, education messages, and follow-up instructions.',
        templates: followupPriority.slice(0, 8).map((f) => ({
          pregnancy_id: f.pregnancy_id,
          full_name: f.full_name,
          phone: f.phone,
          priority_band: f.priority_band,
          sms_reminder: f.priority_band === 'HIGH'
            ? `RMDP HIGH PRIORITY: ${f.full_name}, please attend the health facility urgently. Missed visit + higher risk. Call your CHW if you need help.`
            : `RMDP reminder: ${f.full_name}, you have a missed or due maternal visit. Please come to the facility or contact your CHW.`,
          followup_instructions: f.priority_band === 'HIGH'
            ? 'Home visit today. Check danger signs, BP symptoms, encourage facility attendance, report to midwife.'
            : 'Remind mother of appointment, counsel danger signs, confirm transport plan, document outcome.',
        })),
      };

      return res.json({
        ...base,
        role_profile: {
          title: 'CHW — Community Maternal Follow-up Provider',
          purpose: 'Connect mothers in the community with healthcare facilities through identification, home follow-up, and education.',
          ai_principle: 'AI prioritizes follow-ups, drafts SMS/education messages, and highlights community risk areas. Clinical care remains with facility teams.',
          can: [
            'Identify pregnant women and support registration',
            'Update community contact information',
            'Follow missed ANC / postpartum visits',
            'Follow high-risk mothers at home',
            'Record home visit details, mother condition, and challenges',
            'Provide nutrition, birth preparedness, and danger-sign education',
          ],
          cannot: [
            'Delete clinical records',
            'Approve referrals or override doctor decisions',
            'Access national policy dashboards',
          ],
        },
        today: {
          ...today,
          my_open_tasks: tasks.length,
          visits_planned: visitsToday.planned,
          visits_pending: visitsToday.pending,
          visits_completed: visitsToday.completed,
          high_priority_followups: followupPriority.filter((f) => f.priority_band === 'HIGH').length,
        },
        pregnancy_identification: {
          assigned_mothers: assignedMothers,
          support_registration_path: '/pregnancies/new',
          find_mother_path: '/mothers',
        },
        home_followup: {
          schedule: visitsToday,
          tasks,
          missed: { anc: missedAnc, pnc: missedPnc },
          high_risk_followups: assignedMothers.filter((m) => ['HIGH', 'CRITICAL'].includes(m.risk_score)),
        },
        maternal_education: education,
        ai_support: {
          followup_prioritization: {
            description: 'AI identifies mothers requiring attention. High = missed ANC + hypertension/high-risk; Medium = missed routine appointment.',
            example: {
              high: 'Missed ANC + hypertension history',
              medium: 'Missed routine appointment',
            },
            queue: followupPriority,
            counts: {
              HIGH: followupPriority.filter((f) => f.priority_band === 'HIGH').length,
              MEDIUM: followupPriority.filter((f) => f.priority_band === 'MEDIUM').length,
            },
          },
          communication_assistant: communicationAssistant,
          location_risk_analysis: {
            description: 'AI identifies areas with missed visits, high-risk communities, and poor follow-up trends.',
            communities: locationRisk,
          },
        },
        // Back-compat
        assigned_mothers: assignedMothers,
        visit_schedule: visitsToday,
        tasks,
        missed: { anc: missedAnc, pnc: missedPnc },
        education,
      });
    }

    if (role === 'facility_admin') {
      const workload = systemMonitoring?.staff_workload || [];
      const maxAnc = Math.max(0, ...workload.map((w) => w.anc_visits_7d));
      const avgAnc = workload.length
        ? Math.round(workload.reduce((s, w) => s + w.anc_visits_7d, 0) / workload.length)
        : 0;
      const ancWaitSignal = today.anc_appointments >= 8 || today.mothers_waiting >= 6;
      const performanceInsights = [];
      if (ancWaitSignal) {
        performanceInsights.push({
          severity: 'MEDIUM',
          title: 'ANC waiting pressure',
          message: 'ANC waiting time / volume pressure increased (~30% above a quiet clinic day). Consider increasing appointment distribution across morning and afternoon slots.',
          recommendation: 'Stagger ANC bookings and assign an extra midwife to the ANC desk during peak hours.',
        });
      }
      if (maxAnc > avgAnc + 3 && workload.length > 1) {
        const heavy = workload.find((w) => w.anc_visits_7d === maxAnc);
        performanceInsights.push({
          severity: 'LOW',
          title: 'Staff workload imbalance',
          message: `${heavy?.full_name || 'One midwife'} completed ${maxAnc} ANC visits in 7 days vs facility average ${avgAnc}.`,
          recommendation: 'Redistribute new ANC bookings and CHW follow-up tasks across the team.',
        });
      }
      if ((dataQuality?.incomplete_clinical_forms || 0) > 0) {
        performanceInsights.push({
          severity: 'MEDIUM',
          title: 'Incomplete clinical forms',
          message: `${dataQuality.incomplete_clinical_forms} ANC records missing BP or next-visit date.`,
          recommendation: 'Remind clinical staff to complete mandatory fields before ending a visit.',
        });
      }
      if (!performanceInsights.length) {
        performanceInsights.push({
          severity: 'LOW',
          title: 'Facility performance stable',
          message: 'No major operational bottlenecks detected in current demo data.',
          recommendation: 'Continue routine monitoring of ANC volume and documentation completeness.',
        });
      }

      const qualityFlags = [
        {
          id: 'missing_info',
          label: 'Missing patient information',
          count: (dataQuality?.missing_patient_phone || 0) + (dataQuality?.missing_obstetric_history || 0),
          detail: 'Missing phone numbers or obstetric history on active pregnancies',
        },
        {
          id: 'duplicates',
          label: 'Possible duplicate records',
          count: dataQuality?.possible_duplicate_phones || 0,
          detail: 'Same phone linked to more than one mother at this facility',
        },
        {
          id: 'incomplete_forms',
          label: 'Incomplete clinical forms',
          count: dataQuality?.incomplete_clinical_forms || 0,
          detail: 'ANC visits missing vitals or next appointment',
        },
        {
          id: 'delayed',
          label: 'Delayed documentation / follow-up',
          count: dataQuality?.delayed_documentation || 0,
          detail: 'Open community follow-up tasks',
        },
      ];

      return res.json({
        ...base,
        role_profile: {
          title: 'Facility Administrator — Healthcare Facility System Manager',
          purpose: 'Manage platform operations, users, security, and facility performance.',
          ai_principle: 'AI monitors data quality and facility performance trends. Administrators act on insights; clinical care stays with midwives and doctors.',
          can: [
            'Manage user accounts, roles, and password resets',
            'Configure facility departments and services',
            'Monitor system usage, security logs, and data quality',
            'Review facility performance and staff workload',
          ],
          cannot: [
            'Document clinical encounters or override clinical decisions',
            'Approve referrals or manage emergencies',
            'Access national MoH policy controls',
          ],
        },
        user_management: {
          description: 'Create accounts, assign roles/permissions, reset passwords, activate or deactivate users.',
          roles_available: ['midwife', 'doctor', 'chw', 'facility_admin'],
        },
        facility_configuration: {
          description: 'Maintain facility information, departments, and services offered.',
          path: '/admin/facility',
        },
        facility_overview: facilityOverview,
        system_monitoring: systemMonitoring,
        data_quality: dataQuality,
        reports: {
          daily: true,
          monthly: true,
          maternal_outcomes: true,
          staff_performance: true,
        },
        ai_support: {
          data_quality_monitoring: {
            description: 'AI detects missing patient information, duplicate records, and incomplete clinical forms.',
            flags: qualityFlags,
          },
          facility_performance_analysis: {
            description: 'AI provides staff workload analysis, service performance trends, and resource recommendations.',
            example: {
              input: 'ANC clinic volume rising vs prior quiet days',
              output: 'ANC waiting time increased by 30%. Consider increasing appointment distribution.',
            },
            insights: performanceInsights,
            staff_workload: workload,
          },
        },
      });
    }

    if (role === 'district_officer') {
      const facilities = byFacility.map((f) => {
        const deliveryRate = f.pregnancies
          ? Math.round((f.deliveries / Math.max(f.pregnancies, 1)) * 100)
          : 0;
        const completeness = Math.max(0, 100 - (f.high_risk > 0 && f.emergencies === 0 ? 5 : 0) - (f.pregnancies > 0 && f.deliveries === 0 ? 10 : 0));
        return {
          ...f,
          facility_delivery_rate: deliveryRate,
          data_completeness_score: completeness,
          staff_activity_proxy: f.pregnancies + f.deliveries + f.referrals,
        };
      });

      const topPph = [...facilities].sort((a, b) => b.emergencies - a.emergencies)[0];
      const topRisk = [...facilities].sort((a, b) => b.high_risk - a.high_risk)[0];
      const lowDelivery = [...facilities].filter((f) => f.pregnancies >= 3).sort((a, b) => a.facility_delivery_rate - b.facility_delivery_rate)[0];

      const maternalInsights = [];
      if (topPph && topPph.emergencies > 0) {
        maternalInsights.push({
          severity: 'HIGH',
          facility: topPph.name,
          message: `${topPph.name} has increasing emergency / PPH-related case volume (${topPph.emergencies}). Additional EmONC training recommended.`,
          action: 'Schedule mentorship and PPH drill this month.',
        });
      }
      if (topRisk && topRisk.high_risk > 0) {
        maternalInsights.push({
          severity: 'MEDIUM',
          facility: topRisk.name,
          message: `${topRisk.name} concentrates ${topRisk.high_risk} high-risk pregnancies — a maternal risk hotspot for the district.`,
          action: 'Prioritize supervision visit and ensure referral pathways are active.',
        });
      }
      if (lowDelivery) {
        maternalInsights.push({
          severity: 'MEDIUM',
          facility: lowDelivery.name,
          message: `${lowDelivery.name} facility delivery rate is ${lowDelivery.facility_delivery_rate}% — review birth preparedness counseling and transport barriers.`,
          action: 'Allocate community outreach / CHW support and review ANC counseling quality.',
        });
      }
      if (!maternalInsights.length) {
        maternalInsights.push({
          severity: 'LOW',
          facility: null,
          message: 'District maternal indicators are within expected demo ranges.',
          action: 'Continue routine facility supervision cycles.',
        });
      }

      const predictions = [
        {
          type: 'risk_hotspot',
          message: topRisk
            ? `${topRisk.name} may remain a maternal risk hotspot if high-risk caseload stays elevated.`
            : 'No hotspot predicted from current data.',
        },
        {
          type: 'emergencies',
          message: topPph && topPph.emergencies > 0
            ? `Expect continued emergency pressure at ${topPph.name}; pre-position blood and oxytocin readiness.`
            : 'Emergency volume is currently stable across facilities.',
        },
        {
          type: 'resources',
          message: 'Resource requirement: mentorship days for EmONC and ANC documentation completeness this quarter.',
        },
      ];

      const reports = [
        {
          id: 'district_maternal_summary',
          title: 'District maternal health summary',
          summary: `${facilityOverview?.registered_mothers || 0} pregnancies · ${facilityOverview?.deliveries || 0} deliveries · ${facilityOverview?.emergencies || 0} emergencies`,
        },
        {
          id: 'facility_comparison',
          title: 'Facility performance comparison',
          summary: `${facilities.length} facilities ranked by pregnancies and high-risk load`,
        },
        {
          id: 'intervention_brief',
          title: 'Intervention planning brief',
          summary: maternalInsights[0]?.action || 'Routine supervision',
        },
      ];

      return res.json({
        ...base,
        role_profile: {
          title: 'District Health Officer — District Maternal Health Supervisor',
          purpose: 'Monitor maternal healthcare performance across health facilities in the district.',
          ai_principle: 'AI analyzes district trends, facility differences, and predicts risk hotspots. DHO decisions drive training and resource allocation.',
          can: [
            'Monitor ANC coverage, facility deliveries, emergencies, referrals, and outcomes',
            'Supervise facility performance, staff activity, and data completeness',
            'Plan interventions for training, resources, and improvement programs',
          ],
          cannot: [
            'Edit facility clinical charts remotely',
            'Create national MoH policy',
            'Manage individual CHW home-visit documentation',
          ],
        },
        district_overview: {
          ...facilityOverview,
          anc_coverage_proxy: facilityOverview?.registered_mothers
            ? Math.round((facilityOverview.anc_visits / Math.max(facilityOverview.registered_mothers, 1)) * 10) / 10
            : 0,
          facility_delivery_rate: facilityOverview?.registered_mothers
            ? Math.round((facilityOverview.deliveries / Math.max(facilityOverview.registered_mothers, 1)) * 100)
            : 0,
        },
        health_system_monitoring: {
          anc_coverage: facilityOverview?.anc_visits || 0,
          facility_delivery_rate: facilityOverview?.registered_mothers
            ? Math.round((facilityOverview.deliveries / Math.max(facilityOverview.registered_mothers, 1)) * 100)
            : 0,
          emergency_cases: facilityOverview?.emergencies || 0,
          referral_patterns: facilityOverview?.referrals || 0,
          maternal_outcomes: {
            deliveries: facilityOverview?.deliveries || 0,
            high_risk: riskGrouped.critical.length + riskGrouped.high.length,
            pph_proxy: emergencyCounts.pph,
          },
        },
        facility_supervision: {
          facilities,
          focus: ['performance', 'staff_activity', 'data_completeness'],
        },
        intervention_planning: {
          description: 'Use data for training, resource allocation, and improvement programs.',
          recommended_actions: maternalInsights.map((i) => i.action),
        },
        by_facility: facilities,
        analytics: {
          pph_cases: emergencyCounts.pph,
          high_risk: riskGrouped.critical.length + riskGrouped.high.length,
          referrals: facilityOverview?.referrals || 0,
          emergencies: facilityOverview?.emergencies || 0,
        },
        geographic: facilities.map((f) => ({
          facility: f.name,
          district: f.district,
          high_risk: f.high_risk,
          pregnancies: f.pregnancies,
          emergencies: f.emergencies,
        })),
        ai_support: {
          maternal_health_analytics: {
            description: 'AI analyzes district trends, facility differences, and risk patterns.',
            insights: maternalInsights,
          },
          predictive_analytics: {
            description: 'AI predicts maternal risk hotspots, emergency pressure, and resource needs.',
            example: {
              input: 'Rising emergency volume at Facility A',
              output: 'Facility A has increasing PPH cases. Additional training recommended.',
            },
            predictions,
          },
          dashboard_insights: {
            description: 'Automatically generates reports, trends, and recommendations.',
            reports,
          },
        },
      });
    }

    // MoH — National Maternal Health Strategic Manager
    {
      const districtRanking = Object.values(
        byFacility.reduce((acc, f) => {
          const d = f.district || 'Unknown';
          if (!acc[d]) {
            acc[d] = {
              district: d,
              pregnancies: 0,
              high_risk: 0,
              deliveries: 0,
              emergencies: 0,
              referrals: 0,
              facilities: 0,
            };
          }
          acc[d].pregnancies += f.pregnancies;
          acc[d].high_risk += f.high_risk;
          acc[d].deliveries += f.deliveries;
          acc[d].emergencies += f.emergencies;
          acc[d].referrals += f.referrals;
          acc[d].facilities += 1;
          return acc;
        }, {})
      )
        .map((d) => ({
          ...d,
          delivery_rate: d.pregnancies ? Math.round((d.deliveries / Math.max(d.pregnancies, 1)) * 100) : 0,
          risk_density: d.pregnancies ? Math.round((d.high_risk / Math.max(d.pregnancies, 1)) * 100) : 0,
        }))
        .sort((a, b) => b.emergencies - a.emergencies || b.high_risk - a.high_risk);

      const hotspotDistrict = districtRanking[0];
      const highRiskRegions = districtRanking.filter((d) => d.high_risk > 0 || d.emergencies > 0).slice(0, 5);

      const nationalInsights = [
        {
          theme: 'national_trend',
          message: `National caseload: ${facilityOverview?.registered_mothers || 0} pregnancies, ${facilityOverview?.deliveries || 0} skilled deliveries, ${facilityOverview?.emergencies || 0} emergencies tracked in RMDP.`,
        },
        {
          theme: 'regional_difference',
          message: hotspotDistrict
            ? `${hotspotDistrict.district} currently leads in emergency volume (${hotspotDistrict.emergencies}) and warrants closer EmONC support.`
            : 'Regional differences are within expected demo ranges.',
        },
        {
          theme: 'performance',
          message: `ANC activity volume ${facilityOverview?.anc_visits || 0}; PNC and emergency pathways remain under continuous digital surveillance.`,
        },
      ];

      const predictiveModeling = [
        {
          type: 'mortality_risk',
          message: riskGrouped.critical.length > 3
            ? 'Elevated maternal mortality vigilance advised where critical-risk pregnancies cluster.'
            : 'Maternal mortality risk signal is currently stable within demo data.',
        },
        {
          type: 'demand',
          message: 'Future healthcare demand: sustain ANC4 completion campaigns and EmONC commodity cycles next quarter.',
        },
        {
          type: 'high_risk_region',
          message: hotspotDistrict
            ? `District ${hotspotDistrict.district} may require additional maternal emergency resources within the next quarter.`
            : 'No district currently flagged for surge resources.',
        },
      ];

      const generatedReports = [
        {
          id: 'national_maternal_report',
          title: 'National maternal health report',
          summary: `${facilityOverview?.registered_mothers || 0} pregnancies · ${riskGrouped.critical.length + riskGrouped.high.length} high-risk · ${facilityOverview?.emergencies || 0} emergencies`,
        },
        {
          id: 'policy_summary',
          title: 'Policy summary',
          summary: hotspotDistrict
            ? `Prioritize EmONC readiness and referral strengthening in ${hotspotDistrict.district}.`
            : 'Continue national standards for ANC, SBA, and PNC digital reporting.',
        },
        {
          id: 'performance_dashboard',
          title: 'Performance dashboard export',
          summary: `${districtRanking.length} districts · ${byFacility.length} facilities ranked for programme review`,
        },
      ];

      return res.json({
        ...base,
        role_profile: {
          title: 'Ministry of Health — National Maternal Health Strategic Manager',
          purpose: 'Provide national oversight, policy support, and maternal health intelligence.',
          ai_principle: 'AI delivers national trends, predictive modeling, and auto-generated reports. MoH sets policy and resource priorities.',
          can: [
            'Monitor national maternal mortality signals, neonatal outcomes, ANC/PNC completion, and emergencies',
            'Use data for national programmes, healthcare policies, and resource distribution',
            'Govern digital health standards, data policies, and system integration direction',
          ],
          cannot: [
            'Edit individual clinical records at facilities',
            'Replace district operational supervision',
            'Bypass facility clinical judgment',
          ],
        },
        national_overview: {
          ...facilityOverview,
          skilled_birth_attendance: facilityOverview?.deliveries || 0,
          maternal_mortality: 0,
          neonatal_outcomes: 'Tracked via newborn records',
          anc_completion_proxy: facilityOverview?.anc_visits || 0,
          pnc_completion_proxy: today.postpartum_reviews_due || 0,
        },
        national_monitoring: {
          maternal_mortality: 0,
          neonatal_outcomes: 'Tracked via newborn records',
          anc_completion: facilityOverview?.anc_visits || 0,
          pnc_completion: today.postpartum_reviews_due || 0,
          emergency_cases: facilityOverview?.emergencies || 0,
        },
        policy_and_planning: {
          description: 'Use national data for programmes, policies, and resource distribution.',
          priorities: generatedReports.map((r) => r.summary),
        },
        digital_health_governance: {
          standards: ['Unique mother identity checks', 'Mandatory ANC fields', 'No clinical deletes (corrections only)', 'Role-based access control'],
          data_policies: ['Facility → district → national aggregation', 'Audit logging for sensitive actions', 'AI recommendations require human confirmation in clinical workflows'],
          system_integration: ['RMDP API', 'Facility HIS readiness', 'SMS stub channel for community reminders'],
        },
        national_risk: {
          high_risk: riskGrouped.critical.length + riskGrouped.high.length,
          critical: riskGrouped.critical.length,
          emergencies: facilityOverview?.emergencies || 0,
          disease_flags: {
            hypertension: hypertension.length,
            anemia: severeAnemia.length,
            hiv: riskMothers.filter((r) => r.hiv || r.hiv_status === 'positive').length,
          },
        },
        by_facility: byFacility,
        district_ranking: districtRanking.sort((a, b) => b.deliveries - a.deliveries),
        predictions: {
          mortality_signal: riskGrouped.critical.length > 3 ? 'Elevated vigilance advised' : 'Stable within demo data',
          resource_signal: emergencyCounts.active > 0 ? 'Ensure EmONC readiness at high-volume facilities' : 'Routine commodity cycle',
          hotspot: hotspotDistrict?.district || byFacility.sort((a, b) => b.high_risk - a.high_risk)[0]?.name || '—',
          high_risk_regions: highRiskRegions.map((d) => d.district),
        },
        ai_support: {
          national_health_intelligence: {
            description: 'AI analyzes national maternal trends, regional differences, and healthcare performance.',
            insights: nationalInsights,
          },
          predictive_modeling: {
            description: 'Predict maternal mortality risks, future healthcare demand, and high-risk regions.',
            example: {
              input: 'Rising emergencies clustered in District X',
              output: 'District X may require additional maternal emergency resources within the next quarter.',
            },
            predictions: predictiveModeling,
          },
          report_generation: {
            description: 'Automatically creates national maternal reports, policy summaries, and performance dashboards.',
            reports: generatedReports,
          },
        },
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load dashboard', detail: e.message });
  }
});

module.exports = router;
