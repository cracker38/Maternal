const jwt = require('jsonwebtoken');
const pool = require('../db');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'rmdp_dev_secret');
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

async function audit(userId, facilityId, action, entityType, entityId, details, ip) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, facility_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, facilityId || null, action, entityType || null, entityId || null,
        details ? JSON.stringify(details) : null, ip || null]
    );
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
}

module.exports = { authenticate, authorize, audit };
