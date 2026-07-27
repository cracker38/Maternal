const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { getScope } = require('../utils/scope');

const router = express.Router();

/** Rule 1.2 — Patient identity uniqueness check before registration */
router.get('/duplicate-check', authenticate, async (req, res) => {
  try {
    const { national_id, phone, anc_number } = req.query;
    if (!national_id && !phone && !anc_number) {
      return res.status(400).json({ error: 'Provide national_id, phone, or anc_number' });
    }

    const scope = getScope(req.user);
    const clauses = [];
    const params = [];

    if (national_id) {
      clauses.push('m.national_id = ?');
      params.push(String(national_id).trim());
    }
    if (phone) {
      clauses.push('m.phone = ?');
      params.push(String(phone).trim());
    }
    if (anc_number) {
      clauses.push('p.anc_number = ?');
      params.push(String(anc_number).trim());
    }

    let sql = `
      SELECT m.id AS mother_id, m.full_name, m.national_id, m.phone,
             p.id AS pregnancy_id, p.anc_number, p.risk_score, p.status AS pregnancy_status,
             f.name AS facility_name
      FROM mothers m
      INNER JOIN pregnancies p ON p.mother_id = m.id
        AND p.id = (SELECT MAX(p2.id) FROM pregnancies p2 WHERE p2.mother_id = m.id)
      INNER JOIN facilities f ON f.id = p.facility_id
      WHERE (${clauses.join(' OR ')})`;

    if (scope.level === 'facility' && scope.facilityId) {
      sql += ' AND p.facility_id = ?';
      params.push(scope.facilityId);
    } else if (scope.level === 'district' && scope.district) {
      sql += ' AND f.district = ?';
      params.push(scope.district);
    }

    sql += ' LIMIT 5';
    const [rows] = await pool.execute(sql, params);

    if (rows.length) {
      return res.json({
        duplicate: true,
        message: 'Mother already registered. Open existing maternal profile.',
        matches: rows,
      });
    }
    res.json({ duplicate: false, matches: [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Duplicate check failed', detail: e.message });
  }
});

router.get('/search', authenticate, async (req, res) => {
  try {
    const { q, type } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query required' });
    const term = String(q).trim();
    const scope = getScope(req.user);

    let sql = `
      SELECT m.*, p.id AS pregnancy_id, p.anc_number, p.risk_score, p.status AS pregnancy_status,
             p.gestational_age_weeks, p.edd, p.facility_id, f.name AS facility_name, f.district AS facility_district
      FROM mothers m
      INNER JOIN pregnancies p ON p.mother_id = m.id
        AND p.id = (SELECT MAX(p2.id) FROM pregnancies p2 WHERE p2.mother_id = m.id)
      INNER JOIN facilities f ON f.id = p.facility_id
      WHERE `;
    const params = [];

    if (type === 'national_id') {
      sql += 'm.national_id = ?';
      params.push(term);
    } else if (type === 'phone') {
      sql += 'm.phone LIKE ?';
      params.push(`%${term}%`);
    } else if (type === 'anc_number') {
      sql += 'p.anc_number = ?';
      params.push(term);
    } else if (type === 'qr') {
      sql += '(p.anc_number = ? OR m.id = ? OR m.national_id = ?)';
      params.push(term, Number(term) || 0, term);
    } else {
      sql += '(m.national_id LIKE ? OR m.phone LIKE ? OR m.full_name LIKE ? OR p.anc_number LIKE ?)';
      params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
    }

    if (scope.level === 'facility' && scope.facilityId) {
      sql += ' AND p.facility_id = ?';
      params.push(scope.facilityId);
    } else if (scope.level === 'district' && scope.district) {
      sql += ' AND f.district = ?';
      params.push(scope.district);
    }

    if (req.user.role === 'chw' && scope.facilityId) {
      sql += ` AND (
        EXISTS (SELECT 1 FROM followup_tasks ft WHERE ft.pregnancy_id = p.id AND ft.assigned_to = ?)
        OR p.facility_id = ?
      )`;
      params.push(req.user.id, scope.facilityId);
    }

    sql += ' ORDER BY m.full_name LIMIT 25';
    const [rows] = await pool.execute(sql, params);
    res.json({
      results: rows,
      scope: { level: scope.level, facility_id: scope.facilityId, district: scope.district },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Search failed', detail: e.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const scope = getScope(req.user);
    const [rows] = await pool.execute('SELECT * FROM mothers WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Mother not found' });

    let pregSql = `SELECT p.*, f.name AS facility_name FROM pregnancies p
      JOIN facilities f ON f.id = p.facility_id WHERE p.mother_id = ?`;
    const pregParams = [req.params.id];
    if (scope.level === 'facility' && scope.facilityId) {
      pregSql += ' AND p.facility_id = ?';
      pregParams.push(scope.facilityId);
    } else if (scope.level === 'district' && scope.district) {
      pregSql += ' AND f.district = ?';
      pregParams.push(scope.district);
    }
    pregSql += ' ORDER BY p.registered_at DESC';

    const [pregnancies] = await pool.execute(pregSql, pregParams);
    res.json({ mother: rows[0], pregnancies });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load mother' });
  }
});

/** Rule 1.4 — no permanent delete; clinical corrections only */
router.delete('/:id', authenticate, (_req, res) => {
  res.status(403).json({
    error: 'Clinical records cannot be permanently deleted. Use corrections with audit trail.',
  });
});

module.exports = router;
