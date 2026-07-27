const pool = require('../db');

/**
 * Rule 1.4 — Clinical data cannot be permanently deleted.
 * Corrections store user, time, previous and new values.
 */
async function recordClinicalCorrection({
  userId,
  facilityId,
  entityType,
  entityId,
  fieldName,
  previousValue,
  newValue,
  reason,
  ip,
}) {
  await pool.execute(
    `INSERT INTO clinical_corrections
      (user_id, facility_id, entity_type, entity_id, field_name, previous_value, new_value, reason, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId || null,
      facilityId || null,
      entityType,
      entityId,
      fieldName,
      previousValue == null ? null : String(previousValue),
      newValue == null ? null : String(newValue),
      reason || null,
      ip || null,
    ]
  );
}

function serializeAlertActions(alert) {
  return JSON.stringify({
    actions: alert.recommended_actions || [],
    explanation: alert.explanation || null,
    requires_human_confirmation: alert.requires_human_confirmation !== false,
    ai_decision_support: alert.ai_decision_support !== false,
    disclaimer: alert.disclaimer || 'AI recommendations require human confirmation and do not replace clinical judgment.',
    risk_points: alert.risk_points || 0,
  });
}

async function insertAlert(conn, {
  pregnancyId,
  facilityId,
  userId,
  alert,
}) {
  const executor = conn || pool;
  await executor.execute(
    `INSERT INTO alerts (pregnancy_id, facility_id, alert_type, severity, title, message, recommended_actions, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      pregnancyId,
      facilityId,
      alert.alert_type,
      alert.severity,
      alert.title,
      alert.message,
      serializeAlertActions(alert),
      userId,
    ]
  );
}

module.exports = {
  recordClinicalCorrection,
  serializeAlertActions,
  insertAlert,
};
