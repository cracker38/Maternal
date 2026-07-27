const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const pool = require('../db');
const { authenticate, audit } = require('../middleware/auth');

const router = express.Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  facility_code: z.string().optional(),
});

router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const [users] = await pool.execute(
      `SELECT u.*, f.code AS facility_code, f.name AS facility_name, f.district
       FROM users u
       LEFT JOIN facilities f ON f.id = u.facility_id
       WHERE u.username = ? AND u.is_active = 1`,
      [data.username]
    );
    if (!users.length) return res.status(401).json({ error: 'Invalid username or password' });
    const user = users[0];

    // Facility code check for facility-scoped roles
    if (user.role !== 'moh' && user.role !== 'district_officer') {
      if (!data.facility_code || data.facility_code.trim() === '') {
        return res.status(400).json({ error: 'Facility code is required' });
      }
      if (user.facility_code !== data.facility_code.trim().toUpperCase()) {
        return res.status(401).json({ error: 'Facility code does not match your account' });
      }
    }

    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        facility_id: user.facility_id,
        facility_code: user.facility_code,
        facility_name: user.facility_name,
        district: user.district,
      },
      process.env.JWT_SECRET || 'rmdp_dev_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    await audit(user.id, user.facility_id, 'login', 'user', user.id, { role: user.role }, req.ip);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        facility_id: user.facility_id,
        facility_code: user.facility_code,
        facility_name: user.facility_name,
        district: user.district,
      },
    });
  } catch (e) {
    if (e.name === 'ZodError') return res.status(400).json({ error: 'Username and password are required' });
    console.error(e);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', authenticate, async (req, res) => {
  await audit(req.user.id, req.user.facility_id, 'logout', 'user', req.user.id, null, req.ip);
  res.json({ ok: true });
});

module.exports = router;
