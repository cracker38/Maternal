/**
 * Idempotent lab_results + ultrasound_results schema for RMDP.
 */
const pool = require('../src/db');

async function main() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS lab_results (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pregnancy_id INT NOT NULL,
      facility_id INT NOT NULL,
      anc_visit_id INT NULL,
      test_date DATETIME NOT NULL,
      hemoglobin DECIMAL(4,1) NULL,
      blood_group VARCHAR(10) NULL,
      rh_factor ENUM('positive','negative','unknown') DEFAULT 'unknown',
      hiv_result ENUM('not_done','negative','positive','inconclusive') DEFAULT 'not_done',
      syphilis_result ENUM('not_done','negative','positive','inconclusive') DEFAULT 'not_done',
      hepatitis_b ENUM('not_done','negative','positive','inconclusive') DEFAULT 'not_done',
      malaria_result ENUM('not_done','negative','positive') DEFAULT 'not_done',
      urine_protein ENUM('not_done','negative','trace','1+','2+','3+') DEFAULT 'not_done',
      urine_glucose ENUM('not_done','negative','trace','positive') DEFAULT 'not_done',
      blood_glucose DECIMAL(5,1) NULL,
      wbc DECIMAL(5,1) NULL,
      platelets INT NULL,
      clinical_notes TEXT NULL,
      abnormal_flags JSON NULL,
      recorded_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
      FOREIGN KEY (facility_id) REFERENCES facilities(id),
      FOREIGN KEY (recorded_by) REFERENCES users(id),
      INDEX idx_lab_preg (pregnancy_id),
      INDEX idx_lab_facility (facility_id)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ultrasound_results (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pregnancy_id INT NOT NULL,
      facility_id INT NOT NULL,
      exam_date DATETIME NOT NULL,
      indication VARCHAR(200) NULL,
      ga_by_ultrasound_weeks DECIMAL(4,1) NULL,
      biparietal_diameter_mm DECIMAL(5,1) NULL,
      femur_length_mm DECIMAL(5,1) NULL,
      abdominal_circumference_mm DECIMAL(5,1) NULL,
      estimated_fetal_weight_g INT NULL,
      fetal_heart_activity ENUM('present','absent','not_assessed') DEFAULT 'not_assessed',
      fetal_number ENUM('singleton','twins','triplets','other') DEFAULT 'singleton',
      presentation ENUM('cephalic','breech','transverse','oblique','variable','not_assessed') DEFAULT 'not_assessed',
      placenta_location ENUM('anterior','posterior','fundal','lateral','previa','low_lying','not_assessed') DEFAULT 'not_assessed',
      amniotic_fluid ENUM('normal','oligohydramnios','polyhydramnios','not_assessed') DEFAULT 'not_assessed',
      amniotic_fluid_index DECIMAL(4,1) NULL,
      fetal_anomalies TEXT NULL,
      findings TEXT NULL,
      impression TEXT NULL,
      recommendations TEXT NULL,
      abnormal_flags JSON NULL,
      performed_by_name VARCHAR(120) NULL,
      recorded_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
      FOREIGN KEY (facility_id) REFERENCES facilities(id),
      FOREIGN KEY (recorded_by) REFERENCES users(id),
      INDEX idx_us_preg (pregnancy_id),
      INDEX idx_us_facility (facility_id)
    )
  `);

  console.log('DONE ensure-investigations-schema');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
