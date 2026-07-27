const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');
const { assertPregnancyAccess } = require('../utils/scope');
const { insertAlert } = require('../services/clinicalAudit');
const { evaluateLabResult, evaluateUltrasound } = require('../services/investigationService');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/ultrasound');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `us_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const router = express.Router();

function parseFlags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function toMysqlDatetime(value) {
  if (!value) return new Date();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

/** List lab + ultrasound for a pregnancy */
router.get('/pregnancy/:pregnancyId', authenticate, async (req, res) => {
  try {
    const access = await assertPregnancyAccess(pool, req.user, req.params.pregnancyId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const [labs] = await pool.execute(
      `SELECT lr.*, u.full_name AS recorded_by_name
       FROM lab_results lr
       LEFT JOIN users u ON u.id = lr.recorded_by
       WHERE lr.pregnancy_id = ?
       ORDER BY lr.test_date DESC, lr.id DESC`,
      [req.params.pregnancyId]
    );
    const [ultrasounds] = await pool.execute(
      `SELECT us.*, u.full_name AS recorded_by_name
       FROM ultrasound_results us
       LEFT JOIN users u ON u.id = us.recorded_by
       WHERE us.pregnancy_id = ?
       ORDER BY us.exam_date DESC, us.id DESC`,
      [req.params.pregnancyId]
    );

    // Attach images to each ultrasound
    const usIds = ultrasounds.map((u) => u.id);
    let imageMap = {};
    if (usIds.length) {
      const placeholders = usIds.map(() => '?').join(',');
      try {
        const [imgs] = await pool.execute(
          `SELECT * FROM ultrasound_images WHERE ultrasound_result_id IN (${placeholders}) ORDER BY id ASC`,
          usIds
        );
        for (const img of imgs) {
          if (!imageMap[img.ultrasound_result_id]) imageMap[img.ultrasound_result_id] = [];
          imageMap[img.ultrasound_result_id].push(img);
        }
      } catch { /* table may not exist yet */ }
    }

    res.json({
      lab_results: labs.map((r) => ({ ...r, abnormal_flags: parseFlags(r.abnormal_flags) })),
      ultrasound_results: ultrasounds.map((r) => ({
        ...r,
        abnormal_flags: parseFlags(r.abnormal_flags),
        images: imageMap[r.id] || [],
      })),
      role_capabilities: {
        can_record: ['midwife', 'doctor'].includes(req.user.role),
        can_view: true,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load investigation results' });
  }
});

/** Record lab results */
router.post('/labs', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const b = req.body;
    if (!b.pregnancy_id) return res.status(400).json({ error: 'pregnancy_id required' });

    const access = await assertPregnancyAccess(pool, req.user, b.pregnancy_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const payload = {
      hemoglobin: b.hemoglobin != null && b.hemoglobin !== '' ? Number(b.hemoglobin) : null,
      blood_group: b.blood_group || null,
      rh_factor: b.rh_factor || 'unknown',
      hiv_result: b.hiv_result || 'not_done',
      syphilis_result: b.syphilis_result || 'not_done',
      hepatitis_b: b.hepatitis_b || 'not_done',
      malaria_result: b.malaria_result || 'not_done',
      urine_protein: b.urine_protein || 'not_done',
      urine_glucose: b.urine_glucose || 'not_done',
      blood_glucose: b.blood_glucose != null && b.blood_glucose !== '' ? Number(b.blood_glucose) : null,
      wbc: b.wbc != null && b.wbc !== '' ? Number(b.wbc) : null,
      platelets: b.platelets != null && b.platelets !== '' ? Number(b.platelets) : null,
      clinical_notes: b.clinical_notes || null,
    };

    const { flags, alerts } = evaluateLabResult(payload);

    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO lab_results (
        pregnancy_id, facility_id, anc_visit_id, test_date,
        hemoglobin, blood_group, rh_factor, hiv_result, syphilis_result, hepatitis_b,
        malaria_result, urine_protein, urine_glucose, blood_glucose, wbc, platelets,
        clinical_notes, abnormal_flags, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.pregnancy_id,
        req.user.facility_id,
        b.anc_visit_id || null,
        toMysqlDatetime(b.test_date),
        payload.hemoglobin,
        payload.blood_group,
        payload.rh_factor,
        payload.hiv_result,
        payload.syphilis_result,
        payload.hepatitis_b,
        payload.malaria_result,
        payload.urine_protein,
        payload.urine_glucose,
        payload.blood_glucose,
        payload.wbc,
        payload.platelets,
        payload.clinical_notes,
        JSON.stringify(flags),
        req.user.id,
      ]
    );

    if (payload.hiv_result === 'positive') {
      await conn.execute(`UPDATE pregnancies SET hiv_status = 'positive' WHERE id = ?`, [b.pregnancy_id]);
    }
    if (payload.blood_group) {
      await conn.execute(
        `UPDATE mothers m
         JOIN pregnancies p ON p.mother_id = m.id
         SET m.blood_group = ?
         WHERE p.id = ? AND (m.blood_group IS NULL OR m.blood_group = '' OR m.blood_group = 'unknown')`,
        [payload.blood_group, b.pregnancy_id]
      );
    }

    for (const alert of alerts) {
      await insertAlert(conn, {
        pregnancyId: b.pregnancy_id,
        facilityId: req.user.facility_id,
        userId: req.user.id,
        alert,
      });
    }

    await conn.commit();
    await audit(req.user.id, req.user.facility_id, 'lab_result_create', 'lab_result', result.insertId, {
      pregnancy_id: b.pregnancy_id,
      flags,
    }, req.ip);

    res.status(201).json({
      lab_result_id: result.insertId,
      abnormal_flags: flags,
      alerts_created: alerts.length,
      message: alerts.length
        ? `Lab results saved. ${alerts.length} AI clinical alert(s) generated — confirm with clinical judgment.`
        : 'Lab results saved. No critical lab flags detected.',
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Failed to save lab results', detail: e.message });
  } finally {
    conn.release();
  }
});

/** Record ultrasound results */
router.post('/ultrasound', authenticate, authorize('midwife', 'doctor'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const b = req.body;
    if (!b.pregnancy_id) return res.status(400).json({ error: 'pregnancy_id required' });
    if (!b.findings && !b.impression && !b.ga_by_ultrasound_weeks && !b.fetal_heart_activity) {
      return res.status(400).json({ error: 'Provide ultrasound findings, impression, GA, or fetal heart activity' });
    }

    const access = await assertPregnancyAccess(pool, req.user, b.pregnancy_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const payload = {
      indication: b.indication || null,
      ga_by_ultrasound_weeks: b.ga_by_ultrasound_weeks != null && b.ga_by_ultrasound_weeks !== ''
        ? Number(b.ga_by_ultrasound_weeks) : null,
      biparietal_diameter_mm: b.biparietal_diameter_mm != null && b.biparietal_diameter_mm !== ''
        ? Number(b.biparietal_diameter_mm) : null,
      femur_length_mm: b.femur_length_mm != null && b.femur_length_mm !== ''
        ? Number(b.femur_length_mm) : null,
      abdominal_circumference_mm: b.abdominal_circumference_mm != null && b.abdominal_circumference_mm !== ''
        ? Number(b.abdominal_circumference_mm) : null,
      estimated_fetal_weight_g: b.estimated_fetal_weight_g != null && b.estimated_fetal_weight_g !== ''
        ? Number(b.estimated_fetal_weight_g) : null,
      fetal_heart_activity: b.fetal_heart_activity || 'not_assessed',
      fetal_number: b.fetal_number || 'singleton',
      presentation: b.presentation || 'not_assessed',
      placenta_location: b.placenta_location || 'not_assessed',
      amniotic_fluid: b.amniotic_fluid || 'not_assessed',
      amniotic_fluid_index: b.amniotic_fluid_index != null && b.amniotic_fluid_index !== ''
        ? Number(b.amniotic_fluid_index) : null,
      fetal_anomalies: b.fetal_anomalies || null,
      findings: b.findings || null,
      impression: b.impression || null,
      recommendations: b.recommendations || null,
      performed_by_name: b.performed_by_name || req.user.full_name || null,
    };

    const { flags, alerts } = evaluateUltrasound(payload);

    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO ultrasound_results (
        pregnancy_id, facility_id, exam_date, indication,
        ga_by_ultrasound_weeks, biparietal_diameter_mm, femur_length_mm, abdominal_circumference_mm,
        estimated_fetal_weight_g, fetal_heart_activity, fetal_number, presentation,
        placenta_location, amniotic_fluid, amniotic_fluid_index, fetal_anomalies,
        findings, impression, recommendations, abnormal_flags, performed_by_name, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.pregnancy_id,
        req.user.facility_id,
        toMysqlDatetime(b.exam_date),
        payload.indication,
        payload.ga_by_ultrasound_weeks,
        payload.biparietal_diameter_mm,
        payload.femur_length_mm,
        payload.abdominal_circumference_mm,
        payload.estimated_fetal_weight_g,
        payload.fetal_heart_activity,
        payload.fetal_number,
        payload.presentation,
        payload.placenta_location,
        payload.amniotic_fluid,
        payload.amniotic_fluid_index,
        payload.fetal_anomalies,
        payload.findings,
        payload.impression,
        payload.recommendations,
        JSON.stringify(flags),
        payload.performed_by_name,
        req.user.id,
      ]
    );

    for (const alert of alerts) {
      await insertAlert(conn, {
        pregnancyId: b.pregnancy_id,
        facilityId: req.user.facility_id,
        userId: req.user.id,
        alert,
      });
    }

    await conn.commit();
    await audit(req.user.id, req.user.facility_id, 'ultrasound_result_create', 'ultrasound_result', result.insertId, {
      pregnancy_id: b.pregnancy_id,
      flags,
    }, req.ip);

    res.status(201).json({
      ultrasound_result_id: result.insertId,
      abnormal_flags: flags,
      alerts_created: alerts.length,
      message: alerts.length
        ? `Ultrasound saved. ${alerts.length} AI clinical alert(s) generated — confirm with clinical judgment.`
        : 'Ultrasound results saved.',
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Failed to save ultrasound results', detail: e.message });
  } finally {
    conn.release();
  }
});

/** Upload scan image to an ultrasound result */
router.post('/ultrasound/:id/image', authenticate, authorize('midwife', 'doctor'), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    // Ensure table exists
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ultrasound_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ultrasound_result_id INT NOT NULL,
        filename VARCHAR(200) NOT NULL,
        original_name VARCHAR(200),
        mime_type VARCHAR(80),
        size_bytes INT,
        caption VARCHAR(200),
        uploaded_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ultrasound_result_id) REFERENCES ultrasound_results(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      )
    `);

    const [[us]] = await pool.execute(
      'SELECT id, pregnancy_id FROM ultrasound_results WHERE id = ?',
      [req.params.id]
    );
    if (!us) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Ultrasound result not found' });
    }

    const [result] = await pool.execute(
      `INSERT INTO ultrasound_images (ultrasound_result_id, filename, original_name, mime_type, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [us.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id]
    );

    await audit(req.user.id, req.user.facility_id, 'ultrasound_image_upload', 'ultrasound_image', result.insertId, {
      ultrasound_result_id: us.id,
      filename: req.file.filename,
    }, req.ip);

    res.status(201).json({
      image_id: result.insertId,
      filename: req.file.filename,
      message: 'Scan image uploaded successfully.',
    });
  } catch (e) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    console.error(e);
    res.status(500).json({ error: 'Image upload failed', detail: e.message });
  }
});

/** Serve ultrasound image by filename */
router.get('/ultrasound/image/:filename', authenticate, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Image not found' });
  res.sendFile(filePath);
});

module.exports = router;
