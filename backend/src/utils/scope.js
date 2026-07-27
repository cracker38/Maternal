/**
 * Role-based data scope for RMDP
 * midwife/doctor/chw/admin → facility
 * chw tasks → assigned to self
 * dho → district
 * moh → national
 */

function getScope(user) {
  const role = user?.role;
  if (role === 'moh') {
    return { level: 'national', facilityId: null, district: null, userId: user.id, role };
  }
  if (role === 'district_officer') {
    return {
      level: 'district',
      facilityId: user.facility_id || null,
      district: user.district || null,
      userId: user.id,
      role,
    };
  }
  return {
    level: 'facility',
    facilityId: user.facility_id || null,
    district: user.district || null,
    userId: user.id,
    role,
  };
}

/** SQL fragments for pregnancies aliased as p + facilities as f (optional) */
function pregnancyScopeSql(scope, { pregnancyAlias = 'p', facilityAlias = 'f', requireJoinFacility = false } = {}) {
  const params = [];
  let sql = '';
  if (scope.level === 'facility' && scope.facilityId) {
    sql = ` AND ${pregnancyAlias}.facility_id = ?`;
    params.push(scope.facilityId);
  } else if (scope.level === 'district' && scope.district) {
    if (requireJoinFacility) {
      sql = ` AND ${facilityAlias}.district = ?`;
    } else {
      sql = ` AND ${pregnancyAlias}.facility_id IN (SELECT id FROM facilities WHERE district = ?)`;
    }
    params.push(scope.district);
  }
  return { sql, params };
}

function facilityColumnScope(scope, column) {
  const params = [];
  let sql = '';
  if (scope.level === 'facility' && scope.facilityId) {
    sql = ` AND ${column} = ?`;
    params.push(scope.facilityId);
  } else if (scope.level === 'district' && scope.district) {
    sql = ` AND ${column} IN (SELECT id FROM facilities WHERE district = ?)`;
    params.push(scope.district);
  }
  return { sql, params };
}

async function assertPregnancyAccess(pool, user, pregnancyId) {
  const scope = getScope(user);
  const [rows] = await pool.execute(
    `SELECT p.id, p.facility_id, f.district
     FROM pregnancies p
     JOIN facilities f ON f.id = p.facility_id
     WHERE p.id = ?`,
    [pregnancyId]
  );
  if (!rows.length) return { ok: false, status: 404, error: 'Pregnancy not found' };
  const row = rows[0];

  if (scope.level === 'facility' && scope.facilityId && Number(row.facility_id) !== Number(scope.facilityId)) {
    return { ok: false, status: 403, error: 'This record is outside your facility' };
  }
  if (scope.level === 'district' && scope.district && row.district !== scope.district) {
    return { ok: false, status: 403, error: 'This record is outside your district' };
  }
  if (user.role === 'chw') {
    const [tasks] = await pool.execute(
      `SELECT id FROM followup_tasks WHERE pregnancy_id = ? AND assigned_to = ? LIMIT 1`,
      [pregnancyId, user.id]
    );
    // CHW may also open if same facility for registration support
    if (!tasks.length && scope.facilityId && row.facility_id !== scope.facilityId) {
      return { ok: false, status: 403, error: 'Not assigned to this mother' };
    }
  }
  return { ok: true, pregnancy: row };
}

module.exports = {
  getScope,
  pregnancyScopeSql,
  facilityColumnScope,
  assertPregnancyAccess,
};
