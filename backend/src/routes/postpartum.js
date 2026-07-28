const express = require('express');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { evaluatePostpartum, EMERGENCY_CHECKLISTS } = require('../services/riskEngine');
const { insertAlert } = require('../services/clinicalAudit');
const { assertPregnancyAccess } = require('../utils/scope');

const router = express.Router();

router.get('/pregnancy/:pregnancyId', authenticate, async (req, res) => {
  try {
    const [assessments] = await pool.execute(
      `SELECT * FROM postpartum_assessments WHERE pregnancy_id = ? ORDER BY assessed_at`,
      [req.params.pregnancyId]
    );
    const schedule = ['1h', '6h', '24h', 'discharge', 'day7', 'day42'].map((cp) => ({
      checkpoint: cp,
      completed: assessments.some((a) => a.checkpoint === cp),
      assessment: assessments.find((a) => a.checkpoint === cp) || null,
    }));
    res.json({ assessments, schedule });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load postpartum data' });
  }
});

router.post('/assess', authenticate, authorize('midwife', 'doctor', 'chw'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const b = req.body;
    if (!b.pregnancy_id || !b.checkpoint) {
      return res.status(400).json({ error: 'pregnancy_id and checkpoint required' });
    }

    const access = await assertPregnancyAccess(pool, req.user, b.pregnancy_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const evaluation = evaluatePostpartum({
      ...b,
      mood_low: b.mood_changes || b.mental_health === 'depressed_signs',
      support_concern: b.support_available === false || b.support_available === 0,
    });

    await conn.beginTransaction();
    const nowStr = new Date().toISOString().slice(0,19).replace('T',' ');
    const [result] = await conn.execute(
      `INSERT INTO postpartum_assessments (pregnancy_id, facility_id, checkpoint, assessed_at, bleeding, blood_loss_ml,
        uterus_tone, bp_systolic, bp_diastolic, temperature, breastfeeding, pain_score, mental_health,
        mood_changes, support_available, family_planning, assessed_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.pregnancy_id,
        req.user.facility_id,
        b.checkpoint,
        nowStr,
        b.bleeding || 'normal',
        b.blood_loss_ml ?? null,
        b.uterus_tone || 'firm',
        b.bp_systolic ?? null,
        b.bp_diastolic ?? null,
        b.temperature ?? null,
        b.breastfeeding || 'yes',
        b.pain_score ?? null,
        b.mental_health || 'stable',
        b.mood_changes ? 1 : 0,
        b.support_available === false || b.support_available === 0 ? 0 : 1,
        b.family_planning ? 1 : 0,
        req.user.id,
        b.notes || null,
      ]
    );

    let emergencyId = null;
    for (const a of evaluation.alerts) {
      await insertAlert(conn, {
        pregnancyId: b.pregnancy_id,
        facilityId: req.user.facility_id,
        userId: req.user.id,
        alert: a,
      });
    }

    if (evaluation.pph_suspected) {
      const [em] = await conn.execute(
        `INSERT INTO emergencies (pregnancy_id, facility_id, emergency_type, activated_by, responding_person, activated_at, notes)
         VALUES (?, ?, 'pph', ?, ?, ?, 'Auto-activated by PPH AI alert system — requires clinician confirmation')`,
        [b.pregnancy_id, req.user.facility_id, req.user.id, req.user.full_name || null, new Date().toISOString().slice(0,19).replace('T',' ')]
      );
      emergencyId = em.insertId;
      const checklist = EMERGENCY_CHECKLISTS.pph;
      for (let i = 0; i < checklist.length; i++) {
        await conn.execute(
          `INSERT INTO emergency_actions (emergency_id, action_label, sort_order) VALUES (?, ?, ?)`,
          [emergencyId, checklist[i], i + 1]
        );
      }
    }

    await conn.commit();
    await audit(req.user.id, req.user.facility_id, 'postpartum_assess', 'postpartum_assessment', result.insertId, null, req.ip);

    res.status(201).json({
      assessment_id: result.insertId,
      evaluation,
      pph_suspected: evaluation.pph_suspected,
      mental_health_followup: evaluation.mental_health_followup,
      emergency_id: emergencyId,
      ai_disclaimer: evaluation.ai_disclaimer,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Postpartum assessment failed', detail: e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
