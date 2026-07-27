/**
 * Ensure a second district facility exists so MoH regional comparison is meaningful.
 * Idempotent — safe to re-run.
 */
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

async function main() {
  const [[existing]] = await pool.execute(
    `SELECT id FROM facilities WHERE code = 'NYR-HC-01' LIMIT 1`
  );

  let facilityId = existing?.id;
  if (!facilityId) {
    const [ins] = await pool.execute(
      `INSERT INTO facilities (code, name, facility_type, village, cell_name, sector, district, province, phone)
       VALUES ('NYR-HC-01', 'Nyarugenge Health Center', 'health_center', 'Nyarugenge', 'Nyarugenge', 'Nyarugenge', 'Nyarugenge', 'Kigali', '0788000003')`
    );
    facilityId = ins.insertId;
    console.log('Created facility NYR-HC-01 id=', facilityId);
  } else {
    console.log('Facility NYR-HC-01 already exists id=', facilityId);
  }

  // Minimal caseload for regional contrast
  const [[motherCount]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM pregnancies WHERE facility_id = ?`,
    [facilityId]
  );

  if (Number(motherCount.c) < 2) {
    const stamp = Date.now();
    for (let i = 0; i < 2; i += 1) {
      const [m] = await pool.execute(
        `INSERT INTO mothers (full_name, date_of_birth, national_id, phone, village, cell_name, sector, district)
         VALUES (?, '1994-05-12', ?, ?, 'Nyarugenge', 'Nyarugenge', 'Nyarugenge', 'Nyarugenge')`,
        [
          `Demo Mother Nyr ${i + 1}`,
          `1199${String(stamp).slice(-12)}${i}`,
          `0788${String(stamp + i).slice(-6)}`,
        ]
      );
      const risk = i === 0 ? 'HIGH' : 'MEDIUM';
      await pool.execute(
        `INSERT INTO pregnancies (mother_id, facility_id, anc_number, lmp, edd, gestational_age_weeks, gravida, para, status, risk_score, risk_percent, hiv_status)
         VALUES (?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 28 WEEK), DATE_ADD(CURDATE(), INTERVAL 12 WEEK), 28, 2, 1, 'anc', ?, ?, 'negative')`,
        [m.insertId, facilityId, `NYR-ANC-${stamp}-${i}`, risk, risk === 'HIGH' ? 72 : 45]
      );
    }
    // One emergency for hotspot signal
    const [[preg]] = await pool.execute(
      `SELECT id FROM pregnancies WHERE facility_id = ? ORDER BY id ASC LIMIT 1`,
      [facilityId]
    );
    if (preg) {
      await pool.execute(
        `INSERT INTO emergencies (pregnancy_id, facility_id, emergency_type, status, activated_at)
         VALUES (?, ?, 'pph', 'stabilized', NOW())`,
        [preg.id, facilityId]
      );
    }
    console.log('Seeded Nyarugenge demo pregnancies + emergency');
  } else {
    console.log('Nyarugenge pregnancies already present:', motherCount.c);
  }

  // Optional midwife at that facility for completeness
  const [[staff]] = await pool.execute(
    `SELECT id FROM users WHERE username = 'midwife_nyr' LIMIT 1`
  );
  if (!staff) {
    const hash = await bcrypt.hash('password123', 10);
    await pool.execute(
      `INSERT INTO users (facility_id, username, password_hash, full_name, role, phone, is_active)
       VALUES (?, 'midwife_nyr', ?, 'Alice Nyarugenge', 'midwife', '0788111222', 1)`,
      [facilityId, hash]
    );
    console.log('Created midwife_nyr');
  }

  console.log('DONE ensure-demo-districts');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
