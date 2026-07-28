const express = require('express');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { getScope, facilityColumnScope } = require('../utils/scope');

const router = express.Router();

/** List CHWs at facility for midwife assignment */
router.get('/chws', authenticate, authorize('midwife', 'doctor', 'facility_admin'), async (req, res) => {
  try {
    const facilityId = req.user.facility_id;
    if (!facilityId) return res.status(400).json({ error: 'Facility required' });
    const [rows] = await pool.execute(
      `SELECT id, full_name, username FROM users
       WHERE facility_id = ? AND role = 'chw' AND is_active = 1
       ORDER BY full_name`,
      [facilityId]
    );
    res.json({ chws: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load CHWs' });
  }
});

router.get('/tasks', authenticate, async (req, res) => {
  try {
    const scope = getScope(req.user);
    const params = [];
    let sql = `
      SELECT ft.*, m.full_name, m.phone, m.village, p.anc_number, p.risk_score, u.full_name AS assignee_name
      FROM followup_tasks ft
      JOIN pregnancies p ON p.id = ft.pregnancy_id
      JOIN mothers m ON m.id = p.mother_id
      LEFT JOIN users u ON u.id = ft.assigned_to
      WHERE 1=1`;

    if (req.user.role === 'chw') {
      sql += ' AND ft.assigned_to = ?';
      params.push(req.user.id);
    } else {
      const ft = facilityColumnScope(scope, 'ft.facility_id');
      sql += ft.sql;
      params.push(...ft.params);
    }

    if (req.query.status) {
      sql += ' AND ft.status = ?';
      params.push(req.query.status);
    }

    sql += ' ORDER BY CASE ft.status WHEN \'pending\' THEN 1 WHEN \'in_progress\' THEN 2 WHEN \'completed\' THEN 3 ELSE 4 END, ft.due_date ASC LIMIT 100';
    const [tasks] = await pool.execute(sql, params);

    const missedParams = [];
    let missedSql = `
      SELECT 'missed_anc' AS kind, p.id AS pregnancy_id, p.anc_number, m.full_name, m.phone,
             m.village, av.next_visit_date AS due_date, p.risk_score
      FROM pregnancies p
      JOIN mothers m ON m.id = p.mother_id
      JOIN anc_visits av ON av.id = (
        SELECT av2.id FROM anc_visits av2 WHERE av2.pregnancy_id = p.id ORDER BY av2.visit_number DESC LIMIT 1
      )
      WHERE p.status = 'anc' AND av.next_visit_date < date('now')`;

    if (scope.level === 'facility' && scope.facilityId) {
      missedSql += ' AND p.facility_id = ?';
      missedParams.push(scope.facilityId);
    } else if (scope.level === 'district' && scope.district) {
      missedSql += ' AND p.facility_id IN (SELECT id FROM facilities WHERE district = ?)';
      missedParams.push(scope.district);
    }

    if (req.user.role === 'chw') {
      missedSql += ` AND EXISTS (
        SELECT 1 FROM followup_tasks ft2 WHERE ft2.pregnancy_id = p.id AND ft2.assigned_to = ?
      )`;
      missedParams.push(req.user.id);
    }

    missedSql += ' LIMIT 50';
    const [missed] = await pool.execute(missedSql, missedParams);

    res.json({
      tasks,
      missed_visits: missed,
      scope: { level: scope.level, facility_id: scope.facilityId, district: scope.district },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load community tasks', detail: e.message });
  }
});

router.post('/tasks', authenticate, authorize('midwife', 'doctor', 'chw'), async (req, res) => {
  try {
    const { pregnancy_id, task_type, title, due_date, assigned_to, notes } = req.body;
    const assignee = req.user.role === 'chw' ? req.user.id : (assigned_to || null);
    const [result] = await pool.execute(
      `INSERT INTO followup_tasks (pregnancy_id, facility_id, assigned_to, task_type, title, due_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        pregnancy_id,
        req.user.facility_id,
        assignee,
        task_type || 'home_visit',
        title,
        due_date || null,
        notes || null,
      ]
    );
    await audit(req.user.id, req.user.facility_id, 'create_task', 'followup_task', result.insertId, null, req.ip);
    res.status(201).json({ task_id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.patch('/tasks/:id', authenticate, async (req, res) => {
  try {
    const { status, notes, assigned_to } = req.body;
    if (req.user.role === 'chw') {
      const [[task]] = await pool.execute(
        'SELECT id FROM followup_tasks WHERE id = ? AND assigned_to = ?',
        [req.params.id, req.user.id]
      );
      if (!task) return res.status(403).json({ error: 'Task is not assigned to you' });
    }
    await pool.execute(
      `UPDATE followup_tasks SET
        status = CASE WHEN ? IS NOT NULL THEN ? ELSE status END,
        notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END,
        assigned_to = CASE WHEN ? IS NOT NULL THEN ? ELSE assigned_to END,
        completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
       WHERE id = ?`,
      [status || null, status || null, notes || null, notes || null, assigned_to ?? null, assigned_to ?? null, status || null, new Date().toISOString().slice(0,19).replace('T',' '), req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.post('/assign-missed', authenticate, authorize('midwife', 'chw'), async (req, res) => {
  try {
    const { pregnancy_id, task_type, assigned_to } = req.body;
    const [[preg]] = await pool.execute(
      `SELECT p.*, m.full_name FROM pregnancies p JOIN mothers m ON m.id = p.mother_id WHERE p.id = ?`,
      [pregnancy_id]
    );
    if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });

    if (req.user.facility_id && preg.facility_id !== req.user.facility_id && req.user.role !== 'moh') {
      return res.status(403).json({ error: 'Mother is outside your facility' });
    }

    const title =
      task_type === 'missed_pnc_day7'
        ? `Missed Day 7 PNC — ${preg.full_name}`
        : task_type === 'missed_pnc_day42'
          ? `Missed Day 42 PNC — ${preg.full_name}`
          : `Missed ANC — ${preg.full_name}`;

    const assignee = req.user.role === 'chw' ? req.user.id : (assigned_to || null);

    const [result] = await pool.execute(
      `INSERT INTO followup_tasks (pregnancy_id, facility_id, assigned_to, task_type, title, due_date, status, notes)
       VALUES (?, ?, ?, ?, ?, date('now'), 'pending', 'CHW home visit assigned')`,
      [pregnancy_id, req.user.facility_id || preg.facility_id, assignee, task_type || 'missed_anc', title]
    );
    res.status(201).json({ task_id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to assign visit' });
  }
});

router.post('/home-visit', authenticate, authorize('chw', 'midwife'), async (req, res) => {
  try {
    const {
      task_id,
      pregnancy_id,
      mother_condition,
      challenges,
      education_topics,
      danger_signs,
      notes,
      community_phone,
      community_village,
    } = req.body;

    if (!pregnancy_id) return res.status(400).json({ error: 'pregnancy_id required' });

    const condition = mother_condition || 'stable';
    const challengeText = Array.isArray(challenges) ? challenges.join('; ') : (challenges || '');
    const eduText = Array.isArray(education_topics) ? education_topics.join(', ') : (education_topics || '');
    const visitNotes = [
      `Home visit by ${req.user.full_name || req.user.username}`,
      `Mother condition: ${condition}`,
      challengeText ? `Challenges: ${challengeText}` : null,
      eduText ? `Education: ${eduText}` : null,
      danger_signs ? 'Danger signs reported — notify facility' : null,
      notes || null,
    ].filter(Boolean).join(' | ');

    let taskId = task_id;
    if (taskId) {
      if (req.user.role === 'chw') {
        const [[task]] = await pool.execute(
          'SELECT id FROM followup_tasks WHERE id = ? AND assigned_to = ?',
          [taskId, req.user.id]
        );
        if (!task) return res.status(403).json({ error: 'Task is not assigned to you' });
      }
      await pool.execute(
        `UPDATE followup_tasks SET status = 'completed', notes = ?, completed_at = ? WHERE id = ?`,
        [visitNotes, new Date().toISOString().slice(0,19).replace('T',' '), taskId]
      );
    } else {
      const [result] = await pool.execute(
        `INSERT INTO followup_tasks (pregnancy_id, facility_id, assigned_to, task_type, title, due_date, status, notes, completed_at)
         VALUES (?, ?, ?, 'home_visit', ?, date('now'), 'completed', ?, ?)`,
        [
          pregnancy_id,
          req.user.facility_id,
          req.user.id,
          `Home visit — ${condition}`,
          visitNotes,
          new Date().toISOString().slice(0,19).replace('T',' '),
        ]
      );
      taskId = result.insertId;
    }

    // Optional community info update on mother
    if (community_phone || community_village) {
      const [[preg]] = await pool.execute('SELECT mother_id FROM pregnancies WHERE id = ?', [pregnancy_id]);
      if (preg) {
        await pool.execute(
          `UPDATE mothers SET
            phone = CASE WHEN ? IS NOT NULL THEN ? ELSE phone END,
            village = CASE WHEN ? IS NOT NULL THEN ? ELSE village END
           WHERE id = ?`,
          [community_phone || null, community_phone || null, community_village || null, community_village || null, preg.mother_id]
        );
      }
    }

    const escalate = !!danger_signs || condition === 'emergency' || condition === 'unwell';
    if (escalate) {
      const [[preg]] = await pool.execute(
        'SELECT facility_id FROM pregnancies WHERE id = ?',
        [pregnancy_id]
      );
      const severity = condition === 'emergency' || danger_signs ? 'HIGH' : 'MEDIUM';
      const title = danger_signs || condition === 'emergency'
        ? 'CHW reported danger signs / emergency'
        : 'CHW reported mother unwell at home visit';
      await pool.execute(
        `INSERT INTO alerts (pregnancy_id, facility_id, alert_type, severity, title, message, recommended_actions, created_by)
         VALUES (?, ?, 'chw_danger_signs', ?, ?, ?, ?, ?)`,
        [
          pregnancy_id,
          preg?.facility_id || req.user.facility_id,
          severity,
          title,
          visitNotes,
          JSON.stringify({
            actions: ['Midwife review', 'Call mother', 'Consider facility visit / emergency'],
            explanation: 'Community health worker escalated concern during home follow-up.',
            requires_human_confirmation: true,
            mother_condition: condition,
          }),
          req.user.id,
        ]
      );
    }

    await audit(req.user.id, req.user.facility_id, 'chw_home_visit', 'followup_task', taskId, {
      pregnancy_id,
      mother_condition: condition,
      danger_signs: !!danger_signs,
      escalated: escalate,
    }, req.ip);

    res.status(201).json({
      task_id: taskId,
      recorded: true,
      escalated: escalate,
      sms_stub: {
        channel: 'sms_stub',
        template: escalate
          ? 'RMDP: Please go to the health facility today. Your CHW reported a concern. Bring your ANC card.'
          : 'RMDP: Thank you for the home visit. Remember your next facility appointment and danger signs.',
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to record home visit', detail: e.message });
  }
});

router.post('/sms-draft', authenticate, authorize('chw', 'midwife'), async (req, res) => {
  try {
    const { pregnancy_id, template_type } = req.body;
    const [[row]] = await pool.execute(
      `SELECT m.full_name, m.phone, p.anc_number, p.risk_score
       FROM pregnancies p JOIN mothers m ON m.id = p.mother_id WHERE p.id = ?`,
      [pregnancy_id]
    );
    if (!row) return res.status(404).json({ error: 'Pregnancy not found' });

    const templates = {
      reminder: `RMDP: ${row.full_name}, please attend your maternal care visit. ANC ${row.anc_number || ''}. Contact your CHW if you need help.`,
      education: `RMDP: ${row.full_name}, seek care NOW for bleeding, severe headache, blurred vision, reduced baby movement, or convulsions. Eat iron-rich foods and plan a facility birth.`,
      education_nutrition: `RMDP: ${row.full_name}, eat iron-rich foods and take iron/folate daily for a healthy pregnancy.`,
      education_danger: `RMDP: ${row.full_name}, seek care NOW for bleeding, severe headache, blurred vision, reduced baby movement, or convulsions.`,
      education_birth: `RMDP: ${row.full_name}, plan a facility birth and arrange transport early. Keep your ANC card ready.`,
      high_priority: `RMDP HIGH PRIORITY: ${row.full_name}, please visit the health facility urgently. Your CHW will follow up.`,
    };

    const message = templates[template_type] || templates.reminder;
    await audit(req.user.id, req.user.facility_id, 'chw_sms_draft', 'pregnancy', Number(pregnancy_id), {
      channel: 'sms_stub',
      phone: row.phone,
      template_type: template_type || 'reminder',
      message,
    }, req.ip);

    res.json({
      phone: row.phone,
      message,
      channel: 'sms_stub',
      disclaimer: 'SMS is queued as a stub in this MVP. Final clinical advice remains with facility teams.',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to draft SMS' });
  }
});

module.exports = router;
