const express = require('express');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { validateDelivery } = require('../services/riskEngine');
const { assertPregnancyAccess } = require('../utils/scope');

const router = express.Router();

router.post('/', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const b = req.body;
    if (!b.pregnancy_id) {
      return res.status(400).json({ error: 'pregnancy_id required' });
    }

    const validation = validateDelivery(b);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error, missing: validation.missing });
    }

    const access = await assertPregnancyAccess(pool, req.user, b.pregnancy_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    await conn.beginTransaction();

    const [delResult] = await conn.execute(
      `INSERT INTO deliveries (pregnancy_id, facility_id, delivery_time, delivery_method, blood_loss_ml, tears,
        placenta_condition, conducted_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.pregnancy_id,
        req.user.facility_id,
        b.delivery_time ? new Date(b.delivery_time).toISOString().slice(0,19).replace('T',' ') : new Date().toISOString().slice(0,19).replace('T',' '),
        b.delivery_method,
        b.blood_loss_ml ?? null,
        b.tears || 'none',
        b.placenta_condition || 'complete',
        req.user.id,
        b.notes || null,
      ]
    );

    const baby = b.baby || {};
    await conn.execute(
      `INSERT INTO newborns (delivery_id, birth_weight_g, sex, apgar_1, apgar_5, resuscitation, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        delResult.insertId,
        baby.birth_weight_g ?? null,
        baby.sex || 'unknown',
        baby.apgar_1 ?? null,
        baby.apgar_5 ?? null,
        baby.resuscitation ? 1 : 0,
        baby.notes || null,
      ]
    );

    // Rule 5.2 — Automatic postpartum transition
    await conn.execute(`UPDATE pregnancies SET status = 'postpartum' WHERE id = ?`, [b.pregnancy_id]);
    await conn.execute(
      `UPDATE labor_admissions SET status = 'delivered' WHERE pregnancy_id = ?`,
      [b.pregnancy_id]
    );

    // Rule 6.1 — Postpartum monitoring schedule
    const checkpoints = [
      { type: 'reminder', title: 'Postpartum check — 1 hour (bleeding, uterus, vitals)', days: 0 },
      { type: 'reminder', title: 'Postpartum check — 6 hours (maternal stability)', days: 0 },
      { type: 'reminder', title: 'Postpartum check — 24 hours (recovery)', days: 1 },
      { type: 'reminder', title: 'Discharge safety checklist', days: 1 },
      { type: 'missed_pnc_day7', title: 'Day 7 PNC follow-up', days: 7 },
      { type: 'missed_pnc_day42', title: 'Day 42 final postpartum review', days: 42 },
    ];
    for (const cp of checkpoints) {
      const due = new Date();
      due.setDate(due.getDate() + cp.days);
      await conn.execute(
        `INSERT INTO followup_tasks (pregnancy_id, facility_id, task_type, title, due_date, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [b.pregnancy_id, req.user.facility_id, cp.type, cp.title, due.toISOString().slice(0, 10)]
      );
    }

    await conn.commit();
    await audit(req.user.id, req.user.facility_id, 'delivery', 'delivery', delResult.insertId, null, req.ip);

    res.status(201).json({
      delivery_id: delResult.insertId,
      mother_status: 'postpartum',
      newborn_created: true,
      postpartum_schedule: ['1h', '6h', '24h', 'discharge', 'day7', 'day42'],
      timeline_updated: true,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    if (e.message && e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Delivery already recorded' });
    res.status(500).json({ error: 'Delivery documentation failed' });
  } finally {
    conn.release();
  }
});

router.get('/pregnancy/:pregnancyId', authenticate, async (req, res) => {
  try {
    const [[delivery]] = await pool.execute(
      `SELECT d.*, m.full_name, p.anc_number FROM deliveries d
       JOIN pregnancies p ON p.id = d.pregnancy_id
       JOIN mothers m ON m.id = p.mother_id
       WHERE d.pregnancy_id = ?`,
      [req.params.pregnancyId]
    );
    if (!delivery) return res.status(404).json({ error: 'No delivery record' });
    const [[newborn]] = await pool.execute('SELECT * FROM newborns WHERE delivery_id = ?', [delivery.id]);
    res.json({ delivery, newborn });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load delivery' });
  }
});

router.delete('/:id', authenticate, (_req, res) => {
  res.status(403).json({
    error: 'Clinical records cannot be permanently deleted. Use corrections with audit trail.',
  });
});

module.exports = router;
