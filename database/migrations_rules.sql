-- RMDP Professional System Rules — schema upgrades
-- Safe to re-run: uses IF NOT EXISTS / ignore duplicate column patterns where possible.

CREATE TABLE IF NOT EXISTS clinical_corrections (
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

-- Pregnancy risk percent (0–100 AI score)
SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pregnancies' AND COLUMN_NAME = 'risk_percent'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE pregnancies ADD COLUMN risk_percent DECIMAL(5,2) NULL AFTER risk_score',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pregnancies' AND COLUMN_NAME = 'multiple_pregnancy'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE pregnancies ADD COLUMN multiple_pregnancy TINYINT(1) DEFAULT 0 AFTER abortions',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Referral enrichment (Rule 7.1 / 7.2)
SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referrals' AND COLUMN_NAME = 'clinical_summary'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE referrals ADD COLUMN clinical_summary TEXT NULL AFTER reason',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referrals' AND COLUMN_NAME = 'vital_signs'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE referrals ADD COLUMN vital_signs TEXT NULL AFTER clinical_summary',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referrals' AND COLUMN_NAME = 'treatment_provided'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE referrals ADD COLUMN treatment_provided TEXT NULL AFTER vital_signs',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Expand referral status for transfer tracking
ALTER TABLE referrals MODIFY COLUMN status
  ENUM('pending','accepted','transferred','received','completed','cancelled') DEFAULT 'pending';

-- Emergency outcome (Rule 4.5)
SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'emergencies' AND COLUMN_NAME = 'outcome'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE emergencies ADD COLUMN outcome TEXT NULL AFTER notes',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'emergencies' AND COLUMN_NAME = 'responding_person'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE emergencies ADD COLUMN responding_person VARCHAR(150) NULL AFTER activated_by',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Postpartum mental health screening extras (Rule 6.3)
SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'postpartum_assessments' AND COLUMN_NAME = 'mood_changes'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE postpartum_assessments ADD COLUMN mood_changes TINYINT(1) DEFAULT 0 AFTER mental_health',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'postpartum_assessments' AND COLUMN_NAME = 'support_available'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE postpartum_assessments ADD COLUMN support_available TINYINT(1) DEFAULT 1 AFTER mood_changes',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'postpartum_assessments' AND COLUMN_NAME = 'blood_loss_ml'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE postpartum_assessments ADD COLUMN blood_loss_ml INT NULL AFTER bleeding',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
