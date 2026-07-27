const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');

const router = express.Router();

const ROLES = ['midwife', 'doctor', 'chw', 'facility_admin'];

router.get('/users', authenticate, authorize('facility_admin'), async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, username, full_name, role, phone, is_active, created_at
       FROM users WHERE facility_id = ? ORDER BY role, full_name`,
      [req.user.facility_id]
    );
    res.json({ users });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.post('/users', authenticate, authorize('facility_admin'), async (req, res) => {
  try {
    const { username, password, full_name, role, phone } = req.body;
    if (!username || !password || !full_name || !role) {
      return res.status(400).json({ error: 'username, password, full_name, role required' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role for facility user' });
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      `INSERT INTO users (facility_id, username, password_hash, full_name, role, phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.facility_id, username, hash, full_name, role, phone || null]
    );
    await audit(req.user.id, req.user.facility_id, 'create_user', 'user', result.insertId, { role }, req.ip);
    res.status(201).json({ user_id: result.insertId });
  } catch (e) {
    console.error(e);
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/users/:id', authenticate, authorize('facility_admin'), async (req, res) => {
  try {
    const { full_name, role, phone, is_active, password } = req.body;
    const [[existing]] = await pool.execute(
      'SELECT id FROM users WHERE id = ? AND facility_id = ?',
      [req.params.id, req.user.facility_id]
    );
    if (!existing) return res.status(404).json({ error: 'User not found at this facility' });

    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    await pool.execute(
      `UPDATE users SET
        full_name = COALESCE(?, full_name),
        role = COALESCE(?, role),
        phone = COALESCE(?, phone),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [full_name || null, role || null, phone ?? null, typeof is_active === 'number' || typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null, req.params.id]
    );

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
      await audit(req.user.id, req.user.facility_id, 'reset_password', 'user', Number(req.params.id), null, req.ip);
    }

    await audit(req.user.id, req.user.facility_id, 'update_user', 'user', Number(req.params.id), { role }, req.ip);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

const DEFAULT_DEPARTMENTS = ['ANC clinic', 'Maternity / Labor ward', 'Postpartum', 'Emergency / EmONC', 'Pharmacy', 'Records'];
const DEFAULT_SERVICES = [
  'Antenatal care (ANC)',
  'Skilled delivery',
  'Emergency obstetric care',
  'Postnatal care (PNC)',
  'Referral coordination',
  'Community outreach / CHW linkage',
];

async function loadFacilityConfig(facilityId) {
  const [[row]] = await pool.execute(
    `SELECT details FROM audit_logs
     WHERE facility_id = ? AND action = 'facility_config'
     ORDER BY id DESC LIMIT 1`,
    [facilityId]
  );
  let saved = {};
  if (row?.details) {
    try {
      saved = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
    } catch {
      saved = {};
    }
  }
  return {
    departments: Array.isArray(saved.departments) && saved.departments.length
      ? saved.departments
      : DEFAULT_DEPARTMENTS,
    services: Array.isArray(saved.services) && saved.services.length
      ? saved.services
      : DEFAULT_SERVICES,
  };
}

router.get('/facility', authenticate, authorize('facility_admin'), async (req, res) => {
  try {
    const [[facility]] = await pool.execute('SELECT * FROM facilities WHERE id = ?', [req.user.facility_id]);
    const [[activity]] = await pool.execute(
      `SELECT COUNT(*) AS logins_today FROM audit_logs
       WHERE facility_id = ? AND action = 'login' AND DATE(created_at) = CURDATE()`,
      [req.user.facility_id]
    );
    const [[users]] = await pool.execute(
      `SELECT COUNT(*) AS total, SUM(is_active = 1) AS active_users FROM users WHERE facility_id = ?`,
      [req.user.facility_id]
    );
    const [recentAudit] = await pool.execute(
      `SELECT a.action, a.entity_type, a.created_at, u.full_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.facility_id = ? ORDER BY a.created_at DESC LIMIT 15`,
      [req.user.facility_id]
    );
    const [roleBreakdown] = await pool.execute(
      `SELECT role, COUNT(*) AS count, SUM(is_active = 1) AS active
       FROM users WHERE facility_id = ? GROUP BY role ORDER BY role`,
      [req.user.facility_id]
    );
    const config = await loadFacilityConfig(req.user.facility_id);
    res.json({
      facility,
      activity,
      users,
      recent_audit: recentAudit,
      role_breakdown: roleBreakdown,
      configuration: {
        departments: config.departments,
        services: config.services,
        permissions_note: 'Roles map to RBAC permissions enforced by the API (clinical charting vs operations).',
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load facility admin data' });
  }
});

router.patch('/facility', authenticate, authorize('facility_admin'), async (req, res) => {
  try {
    const {
      name, phone, village, cell_name, sector, facility_type,
      departments, services,
    } = req.body;

    await pool.execute(
      `UPDATE facilities SET
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        village = COALESCE(?, village),
        cell_name = COALESCE(?, cell_name),
        sector = COALESCE(?, sector),
        facility_type = COALESCE(?, facility_type)
       WHERE id = ?`,
      [
        name || null,
        phone ?? null,
        village || null,
        cell_name || null,
        sector || null,
        facility_type || null,
        req.user.facility_id,
      ]
    );

    const current = await loadFacilityConfig(req.user.facility_id);
    const nextConfig = {
      departments: Array.isArray(departments) ? departments.filter(Boolean) : current.departments,
      services: Array.isArray(services) ? services.filter(Boolean) : current.services,
    };

    await audit(req.user.id, req.user.facility_id, 'facility_config', 'facility', req.user.facility_id, nextConfig, req.ip);

    const [[facility]] = await pool.execute('SELECT * FROM facilities WHERE id = ?', [req.user.facility_id]);
    res.json({
      ok: true,
      facility,
      configuration: nextConfig,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update facility configuration', detail: e.message });
  }
});

router.get('/security-logs', authenticate, authorize('facility_admin'), async (req, res) => {
  try {
    const [logs] = await pool.execute(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.created_at, u.full_name, u.username, u.role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.facility_id = ?
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [req.user.facility_id]
    );
    res.json({ logs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load security logs' });
  }
});

module.exports = router;
