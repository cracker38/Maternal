/**
 * SQLite adapter — single database for ALL tables (Render deployment).
 * Uses better-sqlite3 (synchronous, no native build issues on Render).
 * Exposes execute(sql, params), query(), getConnection() to match mysql2 API shape.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(__dirname, '..', '..', 'data', 'rmdp.sqlite');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  facility_type TEXT DEFAULT 'health_center',
  village TEXT, cell_name TEXT, sector TEXT,
  district TEXT NOT NULL,
  province TEXT DEFAULT 'Kigali',
  phone TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_id INTEGER,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  facility_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clinical_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  facility_id INTEGER,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  reason TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mothers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  national_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  phone TEXT,
  village TEXT, cell_name TEXT, sector TEXT, district TEXT,
  insurance TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  blood_group TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pregnancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mother_id INTEGER NOT NULL,
  facility_id INTEGER NOT NULL,
  anc_number TEXT NOT NULL UNIQUE,
  lmp TEXT,
  edd TEXT,
  gestational_age_weeks REAL,
  gravida INTEGER DEFAULT 1,
  para INTEGER DEFAULT 0,
  abortions INTEGER DEFAULT 0,
  multiple_pregnancy INTEGER DEFAULT 0,
  hiv_status TEXT DEFAULT 'unknown',
  risk_score TEXT DEFAULT 'LOW',
  risk_percent REAL,
  status TEXT DEFAULT 'anc',
  registered_by INTEGER,
  registered_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (mother_id) REFERENCES mothers(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);

CREATE TABLE IF NOT EXISTS obstetric_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL UNIQUE,
  previous_stillbirth INTEGER DEFAULT 0,
  previous_csection INTEGER DEFAULT 0,
  previous_pph INTEGER DEFAULT 0,
  previous_eclampsia INTEGER DEFAULT 0,
  previous_premature INTEGER DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS medical_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL UNIQUE,
  hypertension INTEGER DEFAULT 0,
  diabetes INTEGER DEFAULT 0,
  hiv INTEGER DEFAULT 0,
  tb INTEGER DEFAULT 0,
  asthma INTEGER DEFAULT 0,
  epilepsy INTEGER DEFAULT 0,
  sickle_cell INTEGER DEFAULT 0,
  allergies TEXT,
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS anc_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL,
  visit_number INTEGER NOT NULL,
  visit_date TEXT NOT NULL,
  facility_id INTEGER NOT NULL,
  conducted_by INTEGER,
  next_visit_date TEXT,
  counseling_nutrition INTEGER DEFAULT 0,
  counseling_birth_prep INTEGER DEFAULT 0,
  counseling_danger_signs INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (pregnancy_id) REFERENCES pregnancies(id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);

CREATE TABLE IF NOT EXISTS anc_vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anc_visit_id INTEGER NOT NULL UNIQUE,
  bp_systolic INTEGER, bp_diastolic INTEGER,
  temperature REAL, pulse INTEGER, weight_kg REAL,
  fundal_height_cm REAL, fetal_heart_rate INTEGER,
  fetal_movement TEXT DEFAULT 'normal',
  presentation TEXT,
  edema TEXT DEFAULT 'none',
  FOREIGN KEY (anc_visit_id) REFERENCES anc_visits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS anc_labs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anc_visit_id INTEGER NOT NULL UNIQUE,
  hemoglobin REAL,
  hiv_result TEXT DEFAULT 'not_done',
  urine_protein TEXT DEFAULT 'negative',
  glucose TEXT DEFAULT 'negative',
  syphilis TEXT DEFAULT 'not_done',
  FOREIGN KEY (anc_visit_id) REFERENCES anc_visits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS danger_signs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anc_visit_id INTEGER NOT NULL UNIQUE,
  headache INTEGER DEFAULT 0,
  blurred_vision INTEGER DEFAULT 0,
  bleeding INTEGER DEFAULT 0,
  convulsion INTEGER DEFAULT 0,
  reduced_fetal_movement INTEGER DEFAULT 0,
  severe_pain INTEGER DEFAULT 0,
  FOREIGN KEY (anc_visit_id) REFERENCES anc_visits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS treatments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anc_visit_id INTEGER NOT NULL UNIQUE,
  iron INTEGER DEFAULT 0,
  folate INTEGER DEFAULT 0,
  vaccination INTEGER DEFAULT 0,
  malaria_prevention INTEGER DEFAULT 0,
  deworming INTEGER DEFAULT 0,
  FOREIGN KEY (anc_visit_id) REFERENCES anc_visits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL,
  facility_id INTEGER NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  recommended_actions TEXT,
  status TEXT DEFAULT 'active',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_pregnancy ON alerts(pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_alerts_facility  ON alerts(facility_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status    ON alerts(status);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL,
  from_facility_id INTEGER NOT NULL,
  to_facility_name TEXT,
  reason TEXT,
  clinical_summary TEXT,
  vital_signs TEXT,
  treatment_provided TEXT,
  urgency TEXT DEFAULT 'urgent',
  status TEXT DEFAULT 'pending',
  requested_by INTEGER,
  approved_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS labor_admissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL UNIQUE,
  facility_id INTEGER NOT NULL,
  admission_time TEXT NOT NULL,
  contractions TEXT,
  membrane_status TEXT DEFAULT 'intact',
  liquor TEXT,
  cervical_dilation REAL,
  station TEXT,
  presentation TEXT,
  fhr INTEGER,
  bp_systolic INTEGER, bp_diastolic INTEGER, pulse INTEGER,
  admitted_by INTEGER,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS partograph_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  labor_admission_id INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  fhr INTEGER, liquor TEXT, molding TEXT,
  cervical_dilation REAL, station TEXT,
  contractions_per_10min INTEGER,
  contraction_duration_sec INTEGER,
  bp_systolic INTEGER, bp_diastolic INTEGER,
  pulse INTEGER, temperature REAL,
  urine TEXT, medication TEXT,
  recorded_by INTEGER,
  FOREIGN KEY (labor_admission_id) REFERENCES labor_admissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emergencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL,
  facility_id INTEGER NOT NULL,
  emergency_type TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  activated_by INTEGER,
  responding_person TEXT,
  activated_at TEXT NOT NULL,
  notes TEXT,
  outcome TEXT
);

CREATE TABLE IF NOT EXISTS emergency_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emergency_id INTEGER NOT NULL,
  action_label TEXT NOT NULL,
  medication TEXT,
  performed INTEGER DEFAULT 0,
  responsible_person TEXT,
  performed_at TEXT,
  performed_by INTEGER,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (emergency_id) REFERENCES emergencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL UNIQUE,
  facility_id INTEGER NOT NULL,
  delivery_time TEXT NOT NULL,
  delivery_method TEXT NOT NULL,
  blood_loss_ml INTEGER,
  tears TEXT DEFAULT 'none',
  placenta_condition TEXT DEFAULT 'complete',
  conducted_by INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS newborns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER NOT NULL UNIQUE,
  birth_weight_g INTEGER,
  sex TEXT DEFAULT 'unknown',
  apgar_1 INTEGER, apgar_5 INTEGER,
  resuscitation INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS postpartum_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL,
  facility_id INTEGER NOT NULL,
  checkpoint TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  bleeding TEXT DEFAULT 'normal',
  blood_loss_ml INTEGER,
  uterus_tone TEXT DEFAULT 'firm',
  bp_systolic INTEGER, bp_diastolic INTEGER,
  temperature REAL,
  breastfeeding TEXT DEFAULT 'yes',
  pain_score INTEGER,
  mental_health TEXT DEFAULT 'stable',
  mood_changes INTEGER DEFAULT 0,
  support_available INTEGER DEFAULT 1,
  family_planning INTEGER DEFAULT 0,
  assessed_by INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS followup_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL,
  facility_id INTEGER NOT NULL,
  assigned_to INTEGER,
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS lab_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL,
  facility_id INTEGER NOT NULL,
  test_name TEXT NOT NULL,
  test_date TEXT NOT NULL,
  result_value TEXT,
  result_unit TEXT,
  reference_range TEXT,
  abnormal_flags TEXT DEFAULT '[]',
  notes TEXT,
  recorded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ultrasound_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregnancy_id INTEGER NOT NULL,
  facility_id INTEGER NOT NULL,
  exam_date TEXT NOT NULL,
  gestational_age_by_us REAL,
  fetal_presentation TEXT,
  placenta_location TEXT,
  amniotic_fluid TEXT,
  fetal_heart_rate INTEGER,
  findings TEXT,
  abnormal_flags TEXT DEFAULT '[]',
  image_path TEXT,
  recorded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ambulances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_id INTEGER NOT NULL,
  unit_code TEXT NOT NULL,
  plate_number TEXT,
  vehicle_type TEXT DEFAULT 'ambulance',
  status TEXT DEFAULT 'available',
  current_location TEXT,
  crew_lead TEXT,
  crew_phone TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ambulance_dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ambulance_id INTEGER,
  facility_id INTEGER NOT NULL,
  pregnancy_id INTEGER,
  emergency_id INTEGER,
  labor_admission_id INTEGER,
  requested_by INTEGER,
  requester_role TEXT,
  urgency TEXT DEFAULT 'urgent',
  pickup_location TEXT,
  destination_facility TEXT,
  reason TEXT,
  clinical_summary TEXT,
  status TEXT DEFAULT 'pending',
  eta_minutes INTEGER,
  assigned_by INTEGER,
  dispatched_at TEXT,
  arrived_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// ─── Seed demo data (idempotent) ──────────────────────────────────────────────
const seedStmt = db.prepare('SELECT COUNT(*) AS c FROM facilities');
const { c: facCount } = seedStmt.get();
if (facCount === 0) {
  db.exec(`
INSERT INTO facilities (id,code,name,facility_type,village,cell_name,sector,district,province,phone) VALUES
(1,'KGL-HC-01','Kimironko Health Center','health_center','Kimironko','Kibagabaga','Kimironko','Gasabo','Kigali','0788000001'),
(2,'GSO-DH-01','Kibagabaga District Hospital','district_hospital','Kibagabaga','Kibagabaga','Kimironko','Gasabo','Kigali','0788000002'),
(3,'NYR-HC-01','Nyarugenge Health Center','health_center','Nyarugenge','Nyarugenge','Nyarugenge','Nyarugenge','Kigali','0788000003');

INSERT INTO users (id,facility_id,username,password_hash,full_name,role,phone) VALUES
(1,1,'midwife1','$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.','Alice Uwimana','midwife','0788111111'),
(2,1,'doctor1','$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.','Dr. Jean Mugisha','doctor','0788222222'),
(3,1,'chw1','$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.','Grace Mukamana','chw','0788333333'),
(4,1,'admin1','$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.','Paul Habimana','facility_admin','0788444444'),
(5,2,'dho1','$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.','Diane Niyonsaba','district_officer','0788555555'),
(6,NULL,'moh1','$2b$10$RFxuNz6hggEnScFqATaF1eDmtx69ubfaiFs2DJ96dW2fhlc.1vZ3.','MoH Analyst','moh','0788666666');

INSERT INTO ambulances (facility_id,unit_code,plate_number,vehicle_type,status,current_location,crew_lead,crew_phone) VALUES
(1,'AMB-KGL-01','RAC 001A','ambulance','available','Kimironko Health Center','Jean Paul Nkurunziza','0788100001'),
(1,'AMB-KGL-02','RAC 002A','ambulance','available','Kimironko Health Center','Marie Claire Uwase','0788100002'),
(2,'AMB-GSO-01','RAC 003B','ambulance','available','Kibagabaga District Hospital','Eric Habimana','0788100003');
  `);
  console.log('SQLite: demo data seeded');
}

// ─── Adapter ──────────────────────────────────────────────────────────────────
/**
 * execute(sql, params) → Promise<[rows | meta]>
 * Matches mysql2/promise pool.execute() return shape.
 */
function execute(sql, params = []) {
  const s = sql.trim().toUpperCase();
  const mapped = params.map(_coerce);
  try {
    if (s.startsWith('SELECT') || s.startsWith('WITH') || s.startsWith('PRAGMA')) {
      const rows = db.prepare(sql).all(...mapped);
      return Promise.resolve([rows]);
    }
    const info = db.prepare(sql).run(...mapped);
    return Promise.resolve([{ insertId: info.lastInsertRowid, affectedRows: info.changes }]);
  } catch (e) {
    return Promise.reject(e);
  }
}

function _coerce(v) {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return v;
}

// ─── Transaction / connection shim ───────────────────────────────────────────
/**
 * getConnection() returns a connection-like object that supports
 * beginTransaction / commit / rollback / execute / release.
 * Uses better-sqlite3 savepoints so nested calls are safe.
 */
let _txCounter = 0;
function getConnection() {
  const sp = `sp_${++_txCounter}`;
  let active = false;
  const conn = {
    execute,
    beginTransaction() {
      db.prepare(`SAVEPOINT ${sp}`).run();
      active = true;
      return Promise.resolve();
    },
    commit() {
      if (active) { db.prepare(`RELEASE ${sp}`).run(); active = false; }
      return Promise.resolve();
    },
    rollback() {
      if (active) { db.prepare(`ROLLBACK TO ${sp}`).run(); active = false; }
      return Promise.resolve();
    },
    release() { return Promise.resolve(); },
  };
  return Promise.resolve(conn);
}

function query(sql, params) { return execute(sql, params); }

module.exports = { execute, query, getConnection, db };
