-- RMDP — Rwanda Maternal Digital Platform
-- MySQL schema + seed data for XAMPP

CREATE DATABASE IF NOT EXISTS rmdp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rmdp;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS emergency_actions;
DROP TABLE IF EXISTS emergencies;
DROP TABLE IF EXISTS partograph_entries;
DROP TABLE IF EXISTS labor_admissions;
DROP TABLE IF EXISTS postpartum_assessments;
DROP TABLE IF EXISTS newborns;
DROP TABLE IF EXISTS deliveries;
DROP TABLE IF EXISTS followup_tasks;
DROP TABLE IF EXISTS referrals;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS treatments;
DROP TABLE IF EXISTS danger_signs;
DROP TABLE IF EXISTS anc_labs;
DROP TABLE IF EXISTS anc_vitals;
DROP TABLE IF EXISTS anc_visits;
DROP TABLE IF EXISTS medical_history;
DROP TABLE IF EXISTS obstetric_history;
DROP TABLE IF EXISTS pregnancies;
DROP TABLE IF EXISTS mothers;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS facilities;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE facilities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  facility_type ENUM('health_center','district_hospital','referral_hospital') DEFAULT 'health_center',
  village VARCHAR(100),
  cell_name VARCHAR(100),
  sector VARCHAR(100),
  district VARCHAR(100) NOT NULL,
  province VARCHAR(100) DEFAULT 'Kigali',
  phone VARCHAR(30),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  facility_id INT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role ENUM('midwife','doctor','chw','facility_admin','district_officer','moh') NOT NULL,
  phone VARCHAR(30),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);

CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  facility_id INT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80),
  entity_id INT NULL,
  details JSON NULL,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);

CREATE TABLE clinical_corrections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  facility_id INT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id INT NOT NULL,
  field_name VARCHAR(120) NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  reason TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);

CREATE TABLE mothers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  national_id VARCHAR(20) UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  date_of_birth DATE NOT NULL,
  phone VARCHAR(30),
  village VARCHAR(100),
  cell_name VARCHAR(100),
  sector VARCHAR(100),
  district VARCHAR(100),
  insurance VARCHAR(80),
  emergency_contact_name VARCHAR(150),
  emergency_contact_phone VARCHAR(30),
  blood_group VARCHAR(5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pregnancies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mother_id INT NOT NULL,
  facility_id INT NOT NULL,
  anc_number VARCHAR(40) NOT NULL UNIQUE,
  lmp DATE NULL,
  edd DATE NULL,
  gestational_age_weeks DECIMAL(4,1) NULL,
  gravida INT DEFAULT 1,
  para INT DEFAULT 0,
  abortions INT DEFAULT 0,
  multiple_pregnancy TINYINT(1) DEFAULT 0,
  hiv_status ENUM('unknown','negative','positive') DEFAULT 'unknown',
  risk_score ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'LOW',
  risk_percent DECIMAL(5,2) NULL,
  status ENUM('anc','labor','delivered','postpartum','referred','closed') DEFAULT 'anc',
  registered_by INT NULL,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mother_id) REFERENCES mothers(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id),
  FOREIGN KEY (registered_by) REFERENCES users(id)
);

CREATE TABLE obstetric_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL UNIQUE,
  previous_stillbirth TINYINT(1) DEFAULT 0,
  previous_csection TINYINT(1) DEFAULT 0,
  previous_pph TINYINT(1) DEFAULT 0,
  previous_eclampsia TINYINT(1) DEFAULT 0,
  previous_premature TINYINT(1) DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id) ON DELETE CASCADE
);

CREATE TABLE medical_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL UNIQUE,
  hypertension TINYINT(1) DEFAULT 0,
  diabetes TINYINT(1) DEFAULT 0,
  hiv TINYINT(1) DEFAULT 0,
  tb TINYINT(1) DEFAULT 0,
  asthma TINYINT(1) DEFAULT 0,
  epilepsy TINYINT(1) DEFAULT 0,
  sickle_cell TINYINT(1) DEFAULT 0,
  allergies TEXT,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id) ON DELETE CASCADE
);

CREATE TABLE anc_visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL,
  visit_number INT NOT NULL,
  visit_date DATETIME NOT NULL,
  facility_id INT NOT NULL,
  conducted_by INT NULL,
  next_visit_date DATE NULL,
  counseling_nutrition TINYINT(1) DEFAULT 0,
  counseling_birth_prep TINYINT(1) DEFAULT 0,
  counseling_danger_signs TINYINT(1) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id),
  FOREIGN KEY (conducted_by) REFERENCES users(id)
);

CREATE TABLE anc_vitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  anc_visit_id INT NOT NULL UNIQUE,
  bp_systolic INT,
  bp_diastolic INT,
  temperature DECIMAL(4,1),
  pulse INT,
  weight_kg DECIMAL(5,2),
  fundal_height_cm DECIMAL(4,1),
  fetal_heart_rate INT,
  fetal_movement ENUM('normal','reduced','absent') DEFAULT 'normal',
  presentation VARCHAR(40),
  edema ENUM('none','mild','moderate','severe') DEFAULT 'none',
  FOREIGN KEY (anc_visit_id) REFERENCES anc_visits(id) ON DELETE CASCADE
);

CREATE TABLE anc_labs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  anc_visit_id INT NOT NULL UNIQUE,
  hemoglobin DECIMAL(4,1),
  hiv_result ENUM('not_done','negative','positive') DEFAULT 'not_done',
  urine_protein ENUM('negative','trace','1+','2+','3+') DEFAULT 'negative',
  glucose ENUM('negative','trace','positive') DEFAULT 'negative',
  syphilis ENUM('not_done','negative','positive') DEFAULT 'not_done',
  FOREIGN KEY (anc_visit_id) REFERENCES anc_visits(id) ON DELETE CASCADE
);

CREATE TABLE danger_signs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  anc_visit_id INT NOT NULL UNIQUE,
  headache TINYINT(1) DEFAULT 0,
  blurred_vision TINYINT(1) DEFAULT 0,
  bleeding TINYINT(1) DEFAULT 0,
  convulsion TINYINT(1) DEFAULT 0,
  reduced_fetal_movement TINYINT(1) DEFAULT 0,
  severe_pain TINYINT(1) DEFAULT 0,
  FOREIGN KEY (anc_visit_id) REFERENCES anc_visits(id) ON DELETE CASCADE
);

CREATE TABLE treatments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  anc_visit_id INT NOT NULL UNIQUE,
  iron TINYINT(1) DEFAULT 0,
  folate TINYINT(1) DEFAULT 0,
  vaccination TINYINT(1) DEFAULT 0,
  malaria_prevention TINYINT(1) DEFAULT 0,
  deworming TINYINT(1) DEFAULT 0,
  FOREIGN KEY (anc_visit_id) REFERENCES anc_visits(id) ON DELETE CASCADE
);

CREATE TABLE alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL,
  facility_id INT NOT NULL,
  alert_type VARCHAR(80) NOT NULL,
  severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  recommended_actions JSON,
  status ENUM('active','acknowledged','resolved') DEFAULT 'active',
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL,
  from_facility_id INT NOT NULL,
  to_facility_name VARCHAR(150),
  reason TEXT,
  clinical_summary TEXT,
  vital_signs TEXT,
  treatment_provided TEXT,
  urgency ENUM('routine','urgent','emergency') DEFAULT 'urgent',
  status ENUM('pending','accepted','transferred','received','completed','cancelled') DEFAULT 'pending',
  requested_by INT NULL,
  approved_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
  FOREIGN KEY (from_facility_id) REFERENCES facilities(id)
);

CREATE TABLE labor_admissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL UNIQUE,
  facility_id INT NOT NULL,
  admission_time DATETIME NOT NULL,
  contractions VARCHAR(80),
  membrane_status ENUM('intact','ruptured') DEFAULT 'intact',
  liquor VARCHAR(40),
  cervical_dilation DECIMAL(3,1),
  station VARCHAR(10),
  presentation VARCHAR(40),
  fhr INT,
  bp_systolic INT,
  bp_diastolic INT,
  pulse INT,
  admitted_by INT NULL,
  status ENUM('active','delivered','referred','closed') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id),
  FOREIGN KEY (admitted_by) REFERENCES users(id)
);

CREATE TABLE partograph_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  labor_admission_id INT NOT NULL,
  recorded_at DATETIME NOT NULL,
  fhr INT,
  liquor VARCHAR(40),
  molding VARCHAR(20),
  cervical_dilation DECIMAL(3,1),
  station VARCHAR(10),
  contractions_per_10min INT,
  contraction_duration_sec INT,
  bp_systolic INT,
  bp_diastolic INT,
  pulse INT,
  temperature DECIMAL(4,1),
  urine VARCHAR(40),
  medication VARCHAR(200),
  recorded_by INT NULL,
  FOREIGN KEY (labor_admission_id) REFERENCES labor_admissions(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

CREATE TABLE emergencies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL,
  facility_id INT NOT NULL,
  emergency_type ENUM('pph','eclampsia','sepsis','obstructed_labor','uterine_rupture','fetal_distress') NOT NULL,
  status ENUM('active','stabilized','referred','resolved') DEFAULT 'active',
  activated_by INT NULL,
  responding_person VARCHAR(150) NULL,
  activated_at DATETIME NOT NULL,
  notes TEXT,
  outcome TEXT,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id),
  FOREIGN KEY (activated_by) REFERENCES users(id)
);

CREATE TABLE emergency_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emergency_id INT NOT NULL,
  action_label VARCHAR(200) NOT NULL,
  medication VARCHAR(150),
  performed TINYINT(1) DEFAULT 0,
  responsible_person VARCHAR(150),
  performed_at DATETIME NULL,
  performed_by INT NULL,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (emergency_id) REFERENCES emergencies(id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

CREATE TABLE deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL UNIQUE,
  facility_id INT NOT NULL,
  delivery_time DATETIME NOT NULL,
  delivery_method ENUM('svd','assisted','csection') NOT NULL,
  blood_loss_ml INT,
  tears ENUM('none','1st','2nd','3rd','4th') DEFAULT 'none',
  placenta_condition ENUM('complete','incomplete','retained') DEFAULT 'complete',
  conducted_by INT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id),
  FOREIGN KEY (conducted_by) REFERENCES users(id)
);

CREATE TABLE newborns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  delivery_id INT NOT NULL UNIQUE,
  birth_weight_g INT,
  sex ENUM('male','female','unknown') DEFAULT 'unknown',
  apgar_1 INT,
  apgar_5 INT,
  resuscitation TINYINT(1) DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
);

CREATE TABLE postpartum_assessments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL,
  facility_id INT NOT NULL,
  checkpoint ENUM('1h','6h','24h','discharge','day7','day42') NOT NULL,
  assessed_at DATETIME NOT NULL,
  bleeding ENUM('normal','increased','heavy') DEFAULT 'normal',
  blood_loss_ml INT NULL,
  uterus_tone ENUM('firm','boggy','atonic') DEFAULT 'firm',
  bp_systolic INT,
  bp_diastolic INT,
  temperature DECIMAL(4,1),
  breastfeeding ENUM('yes','no','difficult') DEFAULT 'yes',
  pain_score INT,
  mental_health ENUM('stable','anxious','depressed_signs') DEFAULT 'stable',
  mood_changes TINYINT(1) DEFAULT 0,
  support_available TINYINT(1) DEFAULT 1,
  family_planning TINYINT(1) DEFAULT 0,
  assessed_by INT NULL,
  notes TEXT,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id),
  FOREIGN KEY (assessed_by) REFERENCES users(id)
);

CREATE TABLE followup_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pregnancy_id INT NOT NULL,
  facility_id INT NOT NULL,
  assigned_to INT NULL,
  task_type ENUM('missed_anc','missed_pnc_day7','missed_pnc_day42','home_visit','reminder') NOT NULL,
  title VARCHAR(200) NOT NULL,
  due_date DATE,
  status ENUM('pending','in_progress','completed','cancelled') DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- ========== SEED DATA ==========
-- Password for all demo users: password123
-- bcrypt hash of password123

INSERT INTO facilities (id, code, name, facility_type, village, cell_name, sector, district, province, phone) VALUES
(1, 'KGL-HC-01', 'Kimironko Health Center', 'health_center', 'Kimironko', 'Kibagabaga', 'Kimironko', 'Gasabo', 'Kigali', '0788000001'),
(2, 'GSO-DH-01', 'Kibagabaga District Hospital', 'district_hospital', 'Kibagabaga', 'Kibagabaga', 'Kimironko', 'Gasabo', 'Kigali', '0788000002'),
(3, 'NYR-HC-01', 'Nyarugenge Health Center', 'health_center', 'Nyarugenge', 'Nyarugenge', 'Nyarugenge', 'Nyarugenge', 'Kigali', '0788000003');

INSERT INTO users (id, facility_id, username, password_hash, full_name, role, phone) VALUES
(1, 1, 'midwife1', '$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.', 'Alice Uwimana', 'midwife', '0788111111'),
(2, 1, 'doctor1', '$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.', 'Dr. Jean Mugisha', 'doctor', '0788222222'),
(3, 1, 'chw1', '$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.', 'Grace Mukamana', 'chw', '0788333333'),
(4, 1, 'admin1', '$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.', 'Paul Habimana', 'facility_admin', '0788444444'),
(5, 2, 'dho1', '$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.', 'Diane Niyonsaba', 'district_officer', '0788555555'),
(6, NULL, 'moh1', '$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.', 'MoH Analyst', 'moh', '0788666666');
