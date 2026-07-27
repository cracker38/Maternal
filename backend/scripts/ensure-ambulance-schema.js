/**
 * Idempotent ambulance fleet + dispatch schema for RMDP.
 */
const pool = require('../src/db');

async function main() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ambulances (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL,
      unit_code VARCHAR(40) NOT NULL,
      plate_number VARCHAR(30),
      vehicle_type ENUM('basic','advanced','neonatal') DEFAULT 'basic',
      status ENUM('available','dispatched','en_route','on_scene','returning','maintenance') DEFAULT 'available',
      current_location VARCHAR(200),
      crew_lead VARCHAR(120),
      crew_phone VARCHAR(30),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_facility_unit (facility_id, unit_code),
      FOREIGN KEY (facility_id) REFERENCES facilities(id)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ambulance_dispatches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ambulance_id INT NULL,
      facility_id INT NOT NULL,
      pregnancy_id INT NULL,
      emergency_id INT NULL,
      labor_admission_id INT NULL,
      requested_by INT NOT NULL,
      requester_role VARCHAR(40) NOT NULL,
      urgency ENUM('standby','urgent','emergency') NOT NULL DEFAULT 'urgent',
      pickup_location VARCHAR(200),
      destination_facility VARCHAR(200) NOT NULL,
      reason TEXT,
      clinical_summary TEXT,
      status ENUM('pending','assigned','dispatched','en_route','arrived','completed','cancelled') DEFAULT 'pending',
      eta_minutes INT NULL,
      assigned_by INT NULL,
      dispatched_at DATETIME NULL,
      arrived_at DATETIME NULL,
      completed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (ambulance_id) REFERENCES ambulances(id),
      FOREIGN KEY (facility_id) REFERENCES facilities(id),
      FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
      FOREIGN KEY (emergency_id) REFERENCES emergencies(id),
      FOREIGN KEY (requested_by) REFERENCES users(id)
    )
  `);

  const [facilities] = await pool.execute('SELECT id, code, name FROM facilities');
  for (const f of facilities) {
    const [[count]] = await pool.execute(
      'SELECT COUNT(*) AS c FROM ambulances WHERE facility_id = ?',
      [f.id]
    );
    if (Number(count.c) > 0) continue;

    const units = f.code === 'GSO-DH-01'
      ? [
          ['AMB-DH-01', 'RAD 101A', 'advanced', 'District hospital bay', 'Jean Baptiste', '0788111001'],
          ['AMB-DH-02', 'RAD 102B', 'advanced', 'District hospital bay', 'Claudine U.', '0788111002'],
          ['AMB-DH-03', 'RAD 103C', 'neonatal', 'EmONC wing', 'Eric N.', '0788111003'],
        ]
      : [
          ['AMB-HC-01', 'RAD 201A', 'basic', `${f.name} parking`, 'Driver A', '0788222001'],
          ['AMB-HC-02', 'RAD 202B', 'basic', `${f.name} parking`, 'Driver B', '0788222002'],
        ];

    for (const [unit_code, plate, vtype, loc, crew, phone] of units) {
      await pool.execute(
        `INSERT INTO ambulances (facility_id, unit_code, plate_number, vehicle_type, status, current_location, crew_lead, crew_phone)
         VALUES (?, ?, ?, ?, 'available', ?, ?, ?)`,
        [f.id, unit_code, plate, vtype, loc, crew, phone]
      );
    }
    console.log(`Seeded ambulances for ${f.code}`);
  }

  console.log('DONE ensure-ambulance-schema');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
