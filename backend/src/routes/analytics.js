const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function n(v) {
  if (v == null) return 0;
  if (typeof v === 'bigint') return Number(v);
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

router.get('/', authenticate, async (req, res) => {
  try {
    const scope =
      req.query.scope ||
      (req.user.role === 'moh'
        ? 'national'
        : req.user.role === 'district_officer'
          ? 'district'
          : 'facility');

    const facilityId = req.user.facility_id || null;
    const district = req.user.district || null;

    let wherePreg = 'WHERE 1=1';
    let whereDel = 'WHERE 1=1';
    let whereEm = 'WHERE 1=1';
    let whereRef = 'WHERE 1=1';
    const pregParams = [];
    const delParams = [];
    const emParams = [];
    const refParams = [];

    if (scope === 'facility' && facilityId) {
      wherePreg += ' AND p.facility_id = ?'; pregParams.push(facilityId);
      whereDel  += ' AND d.facility_id = ?'; delParams.push(facilityId);
      whereEm   += ' AND e.facility_id = ?'; emParams.push(facilityId);
      whereRef  += ' AND r.from_facility_id = ?'; refParams.push(facilityId);
    } else if (scope === 'district' && district) {
      wherePreg += ' AND f.district = ?'; pregParams.push(district);
      whereDel  += ' AND f.district = ?'; delParams.push(district);
      whereEm   += ' AND f.district = ?'; emParams.push(district);
      whereRef  += ' AND f.district = ?'; refParams.push(district);
    }

    const [ancRows] = await pool.execute(
      `SELECT COUNT(DISTINCT p.id) AS pregnancies,
              COUNT(DISTINCT CASE WHEN av_cnt.c >= 4 THEN p.id END) AS anc4_complete
       FROM pregnancies p
       INNER JOIN facilities f ON f.id = p.facility_id
       LEFT JOIN (
         SELECT pregnancy_id, COUNT(*) AS c FROM anc_visits GROUP BY pregnancy_id
       ) av_cnt ON av_cnt.pregnancy_id = p.id
       ${wherePreg}`,
      pregParams
    );
    const ancCoverage = ancRows[0] || {};

    const [delRows] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN d.delivery_method = 'csection' THEN 1 ELSE 0 END) AS csections,
              SUM(CASE WHEN d.blood_loss_ml >= 500 THEN 1 ELSE 0 END) AS pph_approx
       FROM deliveries d
       INNER JOIN facilities f ON f.id = d.facility_id
       ${whereDel}`,
      delParams
    );
    const deliveries = delRows[0] || {};

    const [emRows] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS active_count,
              SUM(CASE WHEN e.emergency_type = 'pph' THEN 1 ELSE 0 END) AS pph_count
       FROM emergencies e
       INNER JOIN facilities f ON f.id = e.facility_id
       ${whereEm}`,
      emParams
    );
    const emergencies = emRows[0] || {};

    const [pncRows] = await pool.execute(
      `SELECT COUNT(DISTINCT p.id) AS postpartum_mothers,
              COUNT(DISTINCT CASE WHEN pa.checkpoint IN ('day7','day42') THEN p.id END) AS pnc_touched
       FROM pregnancies p
       INNER JOIN facilities f ON f.id = p.facility_id
       LEFT JOIN postpartum_assessments pa ON pa.pregnancy_id = p.id
       ${wherePreg} AND p.status = 'postpartum'`,
      pregParams
    );
    const pnc = pncRows[0] || {};

    const [refRows] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN r.urgency = 'emergency' THEN 1 ELSE 0 END) AS emergency_refs
       FROM referrals r
       INNER JOIN facilities f ON f.id = r.from_facility_id
       ${whereRef}`,
      refParams
    );
    const referrals = refRows[0] || {};

    const [riskRows] = await pool.execute(
      `SELECT
         SUM(CASE WHEN p.risk_score = 'LOW' THEN 1 ELSE 0 END) AS low_n,
         SUM(CASE WHEN p.risk_score = 'MEDIUM' THEN 1 ELSE 0 END) AS medium_n,
         SUM(CASE WHEN p.risk_score = 'HIGH' THEN 1 ELSE 0 END) AS high_n,
         SUM(CASE WHEN p.risk_score = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_n
       FROM pregnancies p
       INNER JOIN facilities f ON f.id = p.facility_id
       ${wherePreg} AND p.status IN ('anc','labor','postpartum')`,
      pregParams
    );
    const risk = riskRows[0] || {};

    const facParams = [];
    let facWhere = 'WHERE 1=1';
    if (scope === 'district' && district) {
      facWhere += ' AND f.district = ?'; facParams.push(district);
    } else if (scope === 'facility' && facilityId) {
      facWhere += ' AND f.id = ?'; facParams.push(facilityId);
    }

    const [byFacilityRaw] = await pool.execute(
      `SELECT f.id, f.name, f.district,
              COUNT(DISTINCT p.id) AS pregnancies,
              SUM(CASE WHEN p.status = 'labor' THEN 1 ELSE 0 END) AS in_labor,
              SUM(CASE WHEN p.risk_score IN ('HIGH','CRITICAL') THEN 1 ELSE 0 END) AS high_risk
       FROM facilities f
       LEFT JOIN pregnancies p ON p.facility_id = f.id
       ${facWhere}
       GROUP BY f.id, f.name, f.district
       ORDER BY f.name`,
      facParams
    );

    const [monthlyRaw] = await pool.execute(
      `SELECT strftime('%Y-%m', d.delivery_time) AS month,
              COUNT(*) AS deliveries,
              SUM(CASE WHEN d.delivery_method = 'csection' THEN 1 ELSE 0 END) AS csections
       FROM deliveries d
       INNER JOIN facilities f ON f.id = d.facility_id
       ${whereDel}
       GROUP BY strftime('%Y-%m', d.delivery_time)
       ORDER BY month DESC
       LIMIT 12`,
      delParams
    );

    const pregnancies = n(ancCoverage.pregnancies);
    const anc4 = n(ancCoverage.anc4_complete);
    const delTotal = n(deliveries.total);
    const csections = n(deliveries.csections);
    const pphApprox = n(deliveries.pph_approx);
    const ppMothers = n(pnc.postpartum_mothers);
    const pncTouched = n(pnc.pnc_touched);

    const ancCompleteRate = pregnancies ? Math.round((anc4 / pregnancies) * 100) : 0;
    const csectionRate = delTotal ? Math.round((csections / delTotal) * 100) : 0;
    const pphRate = delTotal ? Math.round((pphApprox / delTotal) * 100) : 0;
    const pncCoverage = ppMothers ? Math.round((pncTouched / ppMothers) * 100) : 0;

    const by_facility = byFacilityRaw.map((f) => ({
      id: n(f.id), name: f.name, district: f.district,
      pregnancies: n(f.pregnancies), in_labor: n(f.in_labor), high_risk: n(f.high_risk),
    }));

    const monthly_deliveries = monthlyRaw.map((m) => ({
      month: m.month, deliveries: n(m.deliveries), csections: n(m.csections),
    }));

    res.json({
      scope,
      indicators: {
        maternal_deaths: 0,
        near_misses: n(emergencies.total),
        pph_rate: pphRate,
        csection_rate: csectionRate,
        anc_coverage: ancCompleteRate,
        pnc_coverage: pncCoverage,
        deliveries: delTotal,
        emergencies: n(emergencies.total),
        active_emergencies: n(emergencies.active_count),
        pending_referrals: n(referrals.pending),
        high_risk: n(risk.high_n) + n(risk.critical_n),
      },
      risk_distribution: {
        low_n: n(risk.low_n), medium_n: n(risk.medium_n),
        high_n: n(risk.high_n), critical_n: n(risk.critical_n),
      },
      referrals: {
        total: n(referrals.total), pending: n(referrals.pending),
        emergency_refs: n(referrals.emergency_refs),
      },
      by_facility,
      monthly_deliveries,
      facility: {
        anc_completion: ancCompleteRate,
        deliveries: delTotal,
        emergencies: n(emergencies.total),
      },
    });
  } catch (e) {
    console.error('Analytics error:', e);
    res.status(500).json({ error: 'Analytics failed', detail: e.message || String(e) });
  }
});

module.exports = router;
