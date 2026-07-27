-- Seed continuation: mothers, pregnancies, clinical demo data
USE rmdp;

-- Fix demo passwords (password123) — will be updated by seed script if needed
-- Placeholder until seed-users.js runs

INSERT INTO mothers (id, national_id, full_name, date_of_birth, phone, village, cell_name, sector, district, insurance, emergency_contact_name, emergency_contact_phone, blood_group) VALUES
(1, '1199880012345678', 'Claudine Mukamana', '1995-03-12', '0789010001', 'Kimironko', 'Kibagabaga', 'Kimironko', 'Gasabo', 'Mutuelle', 'Eric Mukamana', '0789011001', 'O+'),
(2, '1199900023456789', 'Immaculee Uwase', '1998-07-22', '0789010002', 'Remera', 'Rukiri', 'Remera', 'Gasabo', 'RSSB', 'Jean Uwase', '0789011002', 'A+'),
(3, '1199850034567890', 'Beatrice Ingabire', '1992-11-05', '0789010003', 'Kacyiru', 'Kamatamu', 'Kacyiru', 'Gasabo', 'Mutuelle', 'Paul Ingabire', '0789011003', 'B+'),
(4, '1199930045678901', 'Solange Nyiraneza', '2000-01-18', '0789010004', 'Gisozi', 'Musezero', 'Gisozi', 'Gasabo', 'Mutuelle', 'David Nyiraneza', '0789011004', 'AB+'),
(5, '1199870056789012', 'Francine Uwimana', '1994-09-30', '0789010005', 'Kimironko', 'Bibare', 'Kimironko', 'Gasabo', 'Private', 'Joseph Uwimana', '0789011005', 'O-'),
(6, '1199910067890123', 'Divine Mukeshimana', '1997-05-14', '0789010006', 'Nyarutarama', 'Gacuriro', 'Remera', 'Gasabo', 'Mutuelle', 'Patrick Mukeshimana', '0789011006', 'A-'),
(7, '1199860078901234', 'Chantal Habimana', '1993-12-08', '0789010007', 'Kibagabaga', 'Kibagabaga', 'Kimironko', 'Gasabo', 'RSSB', 'Samuel Habimana', '0789011007', 'B-'),
(8, '1199940089012345', 'Ange Iradukunda', '2001-04-25', '0789010008', 'Kimironko', 'Kibagabaga', 'Kimironko', 'Gasabo', 'Mutuelle', 'Yves Iradukunda', '0789011008', 'O+'),
(9, '1199890090123456', 'Yvette Niyonsenga', '1996-08-19', '0789010009', 'Remera', 'Rukiri', 'Remera', 'Gasabo', 'Mutuelle', 'Fred Niyonsenga', '0789011009', 'A+'),
(10, '1199920101234567', 'Marie Claire Uwera', '1999-02-28', '0789010010', 'Gisozi', 'Musezero', 'Gisozi', 'Gasabo', 'RSSB', 'Kevin Uwera', '0789011010', 'O+');

INSERT INTO pregnancies (id, mother_id, facility_id, anc_number, lmp, edd, gestational_age_weeks, gravida, para, abortions, hiv_status, risk_score, status, registered_by) VALUES
(1, 1, 1, 'ANC-2026-0001', '2025-11-01', '2026-08-08', 32.0, 2, 1, 0, 'negative', 'MEDIUM', 'anc', 1),
(2, 2, 1, 'ANC-2026-0002', '2025-12-15', '2026-09-21', 26.0, 1, 0, 0, 'negative', 'LOW', 'anc', 1),
(3, 3, 1, 'ANC-2026-0003', '2025-10-10', '2026-07-17', 36.0, 4, 2, 1, 'negative', 'HIGH', 'anc', 1),
(4, 4, 1, 'ANC-2026-0004', '2025-09-20', '2026-06-27', 38.5, 2, 1, 0, 'negative', 'CRITICAL', 'labor', 1),
(5, 5, 1, 'ANC-2026-0005', '2025-09-01', '2026-06-08', 41.0, 3, 2, 0, 'positive', 'HIGH', 'labor', 1),
(6, 6, 1, 'ANC-2026-0006', '2025-08-15', '2026-05-22', 42.0, 1, 0, 0, 'negative', 'MEDIUM', 'postpartum', 1),
(7, 7, 1, 'ANC-2026-0007', '2025-08-01', '2026-05-08', 43.0, 5, 3, 1, 'negative', 'HIGH', 'postpartum', 1),
(8, 8, 1, 'ANC-2026-0008', '2025-11-20', '2026-08-27', 30.0, 1, 0, 0, 'negative', 'LOW', 'anc', 1),
(9, 9, 1, 'ANC-2026-0009', '2025-12-01', '2026-09-07', 28.0, 2, 1, 0, 'negative', 'MEDIUM', 'anc', 1),
(10, 10, 1, 'ANC-2026-0010', '2025-10-25', '2026-08-01', 34.0, 3, 1, 0, 'negative', 'HIGH', 'anc', 1);

INSERT INTO obstetric_history (pregnancy_id, previous_stillbirth, previous_csection, previous_pph, previous_eclampsia, previous_premature) VALUES
(1, 0, 0, 0, 0, 0),
(2, 0, 0, 0, 0, 0),
(3, 1, 1, 0, 0, 1),
(4, 0, 1, 0, 0, 0),
(5, 0, 0, 1, 0, 0),
(6, 0, 0, 0, 0, 0),
(7, 0, 1, 1, 1, 0),
(8, 0, 0, 0, 0, 0),
(9, 0, 0, 0, 0, 0),
(10, 0, 1, 0, 0, 0);

INSERT INTO medical_history (pregnancy_id, hypertension, diabetes, hiv, tb, asthma, epilepsy, sickle_cell, allergies) VALUES
(1, 0, 0, 0, 0, 0, 0, 0, NULL),
(2, 0, 0, 0, 0, 0, 0, 0, NULL),
(3, 1, 0, 0, 0, 0, 0, 0, 'Penicillin'),
(4, 0, 0, 0, 0, 0, 0, 0, NULL),
(5, 0, 0, 1, 0, 0, 0, 0, NULL),
(6, 0, 0, 0, 0, 0, 0, 0, NULL),
(7, 1, 0, 0, 0, 0, 0, 0, NULL),
(8, 0, 0, 0, 0, 0, 0, 0, NULL),
(9, 0, 1, 0, 0, 0, 0, 0, NULL),
(10, 1, 0, 0, 0, 0, 0, 0, NULL);

INSERT INTO anc_visits (id, pregnancy_id, visit_number, visit_date, facility_id, conducted_by, next_visit_date, counseling_nutrition, counseling_birth_prep, counseling_danger_signs) VALUES
(1, 1, 1, '2026-01-15 09:00:00', 1, 1, '2026-02-15', 1, 1, 1),
(2, 1, 2, '2026-02-15 10:00:00', 1, 1, '2026-03-15', 1, 1, 1),
(3, 1, 3, '2026-03-20 09:30:00', 1, 1, '2026-04-20', 1, 1, 1),
(4, 2, 1, '2026-02-01 11:00:00', 1, 1, '2026-03-01', 1, 1, 1),
(5, 2, 2, '2026-03-05 09:00:00', 1, 1, '2026-04-05', 1, 1, 1),
(6, 3, 1, '2025-12-20 08:00:00', 1, 1, '2026-01-20', 1, 1, 1),
(7, 3, 2, '2026-01-25 09:00:00', 1, 1, '2026-02-25', 1, 1, 1),
(8, 3, 3, '2026-03-01 10:00:00', 1, 1, '2026-04-01', 1, 1, 1),
(9, 3, 4, '2026-04-10 09:00:00', 1, 1, '2026-05-01', 1, 1, 1),
(10, 8, 1, '2026-02-10 10:00:00', 1, 1, '2026-03-10', 1, 1, 1),
(11, 9, 1, '2026-02-20 11:00:00', 1, 1, '2026-03-20', 1, 0, 1),
(12, 10, 1, '2026-01-10 09:00:00', 1, 1, '2026-02-10', 1, 1, 1),
(13, 10, 2, '2026-03-01 09:00:00', 1, 1, '2026-04-01', 1, 1, 1);

INSERT INTO anc_vitals (anc_visit_id, bp_systolic, bp_diastolic, temperature, pulse, weight_kg, fundal_height_cm, fetal_heart_rate, fetal_movement, presentation, edema) VALUES
(1, 118, 72, 36.6, 78, 62.0, 28.0, 140, 'normal', 'cephalic', 'none'),
(2, 122, 78, 36.5, 80, 64.5, 30.0, 142, 'normal', 'cephalic', 'mild'),
(3, 128, 82, 36.7, 82, 67.0, 32.0, 138, 'normal', 'cephalic', 'mild'),
(4, 110, 70, 36.4, 76, 58.0, 22.0, 145, 'normal', 'cephalic', 'none'),
(5, 112, 72, 36.5, 78, 60.0, 24.0, 144, 'normal', 'cephalic', 'none'),
(6, 138, 88, 36.6, 84, 70.0, 28.0, 136, 'normal', 'cephalic', 'mild'),
(7, 142, 92, 36.8, 88, 72.0, 30.0, 134, 'normal', 'cephalic', 'moderate'),
(8, 148, 95, 36.7, 90, 74.0, 34.0, 132, 'reduced', 'cephalic', 'moderate'),
(9, 150, 98, 36.9, 92, 76.0, 36.0, 130, 'reduced', 'cephalic', 'severe'),
(10, 115, 70, 36.5, 74, 55.0, 26.0, 148, 'normal', 'cephalic', 'none'),
(11, 120, 75, 36.6, 76, 61.0, 24.0, 140, 'normal', 'cephalic', 'none'),
(12, 135, 88, 36.5, 82, 65.0, 30.0, 138, 'normal', 'cephalic', 'mild'),
(13, 145, 94, 36.8, 86, 68.0, 34.0, 128, 'reduced', 'breech', 'moderate');

INSERT INTO anc_labs (anc_visit_id, hemoglobin, hiv_result, urine_protein, glucose, syphilis) VALUES
(1, 11.2, 'negative', 'negative', 'negative', 'negative'),
(2, 10.8, 'negative', 'negative', 'negative', 'negative'),
(3, 10.5, 'negative', 'trace', 'negative', 'negative'),
(4, 12.0, 'negative', 'negative', 'negative', 'negative'),
(5, 11.8, 'negative', 'negative', 'negative', 'negative'),
(6, 9.5, 'negative', '1+', 'negative', 'negative'),
(7, 8.8, 'negative', '2+', 'negative', 'negative'),
(8, 7.5, 'negative', '2+', 'negative', 'negative'),
(9, 6.8, 'negative', '3+', 'negative', 'negative'),
(10, 11.5, 'negative', 'negative', 'negative', 'negative'),
(11, 10.2, 'negative', 'negative', 'trace', 'negative'),
(12, 9.0, 'negative', '1+', 'negative', 'negative'),
(13, 6.5, 'negative', '2+', 'negative', 'negative');

INSERT INTO danger_signs (anc_visit_id, headache, blurred_vision, bleeding, convulsion, reduced_fetal_movement, severe_pain) VALUES
(1, 0, 0, 0, 0, 0, 0),
(2, 0, 0, 0, 0, 0, 0),
(3, 0, 0, 0, 0, 0, 0),
(4, 0, 0, 0, 0, 0, 0),
(5, 0, 0, 0, 0, 0, 0),
(6, 1, 0, 0, 0, 0, 0),
(7, 1, 1, 0, 0, 0, 0),
(8, 1, 1, 0, 0, 1, 0),
(9, 1, 1, 0, 0, 1, 1),
(10, 0, 0, 0, 0, 0, 0),
(11, 0, 0, 0, 0, 0, 0),
(12, 0, 0, 0, 0, 0, 0),
(13, 1, 0, 0, 0, 1, 0);

INSERT INTO treatments (anc_visit_id, iron, folate, vaccination, malaria_prevention, deworming) VALUES
(1, 1, 1, 1, 1, 0),
(2, 1, 1, 0, 1, 1),
(3, 1, 1, 0, 1, 0),
(4, 1, 1, 1, 1, 0),
(5, 1, 1, 0, 1, 0),
(6, 1, 1, 1, 1, 1),
(7, 1, 1, 0, 1, 0),
(8, 1, 1, 0, 1, 0),
(9, 1, 1, 0, 1, 0),
(10, 1, 1, 1, 1, 0),
(11, 1, 1, 0, 1, 0),
(12, 1, 1, 1, 1, 0),
(13, 1, 1, 0, 1, 0);

INSERT INTO alerts (pregnancy_id, facility_id, alert_type, severity, title, message, recommended_actions, status, created_by) VALUES
(3, 1, 'hypertension', 'HIGH', 'Possible hypertensive disorder', 'BP ≥140/90 detected across recent ANC visits.', '["Notify doctor","Increase monitoring frequency","Counsel on danger signs"]', 'active', 1),
(3, 1, 'preeclampsia', 'CRITICAL', 'Preeclampsia suspected', 'High BP with proteinuria. RED ALERT.', '["Emergency review","Prepare referral","Monitor fetal wellbeing"]', 'active', 1),
(3, 1, 'severe_anemia', 'CRITICAL', 'Severe anemia', 'Hemoglobin <7 g/dL.', '["Urgent doctor review","Consider transfusion readiness","Iron therapy"]', 'active', 1),
(4, 1, 'previous_csection', 'HIGH', 'Previous C-section', 'Mother has history of caesarean section — scar risk in labor.', '["Senior midwife review","Prepare for possible C-section","Continuous FHR monitoring"]', 'active', 1),
(5, 1, 'high_risk', 'HIGH', 'High-risk pregnancy in labor', 'HIV-positive mother with previous PPH.', '["Strict infection control","PPH preparedness","Notify doctor"]', 'active', 1),
(10, 1, 'severe_anemia', 'CRITICAL', 'Severe anemia', 'Hb 6.5 g/dL at last ANC.', '["Urgent doctor review","Referral consideration"]', 'active', 1),
(10, 1, 'hypertension', 'HIGH', 'Hypertension detected', 'BP 145/94 with reduced fetal movement.', '["Notify doctor","Increase monitoring"]', 'active', 1);

INSERT INTO referrals (pregnancy_id, from_facility_id, to_facility_name, reason, urgency, status, requested_by) VALUES
(3, 1, 'Kibagabaga District Hospital', 'Suspected preeclampsia with severe anemia', 'emergency', 'pending', 1),
(10, 1, 'Kibagabaga District Hospital', 'Severe anemia + hypertensive disorder', 'urgent', 'pending', 1);

INSERT INTO labor_admissions (id, pregnancy_id, facility_id, admission_time, contractions, membrane_status, liquor, cervical_dilation, station, presentation, fhr, bp_systolic, bp_diastolic, pulse, admitted_by, status) VALUES
(1, 4, 1, '2026-07-18 06:30:00', '3/10min moderate', 'intact', 'clear', 4.0, '-1', 'cephalic', 138, 128, 82, 88, 1, 'active'),
(2, 5, 1, '2026-07-18 08:00:00', '4/10min strong', 'ruptured', 'clear', 6.0, '0', 'cephalic', 142, 118, 76, 92, 1, 'active');

INSERT INTO partograph_entries (labor_admission_id, recorded_at, fhr, liquor, molding, cervical_dilation, station, contractions_per_10min, contraction_duration_sec, bp_systolic, bp_diastolic, pulse, temperature, urine, medication, recorded_by) VALUES
(1, '2026-07-18 06:30:00', 138, 'clear', '0', 4.0, '-1', 3, 35, 128, 82, 88, 36.8, 'clear', NULL, 1),
(1, '2026-07-18 07:00:00', 140, 'clear', '0', 4.5, '-1', 3, 40, 130, 84, 90, 36.8, 'clear', NULL, 1),
(1, '2026-07-18 07:30:00', 136, 'clear', '0', 5.0, '0', 4, 40, 132, 85, 90, 36.9, 'clear', NULL, 1),
(1, '2026-07-18 08:00:00', 134, 'clear', '1+', 5.5, '0', 4, 45, 135, 88, 94, 37.0, 'clear', NULL, 1),
(2, '2026-07-18 08:00:00', 142, 'clear', '0', 6.0, '0', 4, 45, 118, 76, 92, 36.7, 'clear', 'Oxytocin ready', 1),
(2, '2026-07-18 08:30:00', 145, 'clear', '0', 7.0, '+1', 4, 50, 120, 78, 94, 36.8, 'clear', NULL, 1);

INSERT INTO deliveries (id, pregnancy_id, facility_id, delivery_time, delivery_method, blood_loss_ml, tears, placenta_condition, conducted_by) VALUES
(1, 6, 1, '2026-07-15 14:20:00', 'svd', 250, '1st', 'complete', 1),
(2, 7, 1, '2026-07-14 22:10:00', 'csection', 600, 'none', 'complete', 2);

INSERT INTO newborns (delivery_id, birth_weight_g, sex, apgar_1, apgar_5, resuscitation) VALUES
(1, 3200, 'female', 8, 9, 0),
(2, 2800, 'male', 6, 8, 1);

INSERT INTO postpartum_assessments (pregnancy_id, facility_id, checkpoint, assessed_at, bleeding, uterus_tone, bp_systolic, bp_diastolic, temperature, breastfeeding, pain_score, mental_health, family_planning, assessed_by) VALUES
(6, 1, '1h', '2026-07-15 15:20:00', 'normal', 'firm', 110, 70, 36.6, 'yes', 3, 'stable', 0, 1),
(6, 1, '6h', '2026-07-15 20:20:00', 'normal', 'firm', 112, 72, 36.7, 'yes', 2, 'stable', 0, 1),
(6, 1, '24h', '2026-07-16 14:20:00', 'normal', 'firm', 115, 74, 36.5, 'yes', 2, 'stable', 1, 1),
(7, 1, '1h', '2026-07-14 23:10:00', 'increased', 'boggy', 95, 58, 36.8, 'difficult', 5, 'anxious', 0, 1),
(7, 1, '6h', '2026-07-15 04:10:00', 'normal', 'firm', 108, 68, 36.9, 'yes', 4, 'stable', 0, 1);

INSERT INTO emergencies (id, pregnancy_id, facility_id, emergency_type, status, activated_by, activated_at, notes) VALUES
(1, 7, 1, 'pph', 'stabilized', 1, '2026-07-14 23:15:00', 'PPH suspected at 1h postpartum — responded to oxytocin and uterine massage');

INSERT INTO emergency_actions (emergency_id, action_label, medication, performed, responsible_person, performed_at, performed_by, sort_order) VALUES
(1, 'Call for help / activate emergency team', NULL, 1, 'Alice Uwimana', '2026-07-14 23:15:00', 1, 1),
(1, 'Uterine massage', NULL, 1, 'Alice Uwimana', '2026-07-14 23:16:00', 1, 2),
(1, 'Administer oxytocin', 'Oxytocin 10 IU IM', 1, 'Alice Uwimana', '2026-07-14 23:17:00', 1, 3),
(1, 'IV fluids', 'RL 1L', 1, 'Alice Uwimana', '2026-07-14 23:18:00', 1, 4),
(1, 'Blood request / crossmatch', NULL, 1, 'Dr. Jean Mugisha', '2026-07-14 23:20:00', 2, 5),
(1, 'Doctor notification', NULL, 1, 'Alice Uwimana', '2026-07-14 23:15:30', 1, 6);

INSERT INTO followup_tasks (pregnancy_id, facility_id, assigned_to, task_type, title, due_date, status, notes) VALUES
(9, 1, 3, 'missed_anc', 'Missed ANC visit — Yvette Niyonsenga', '2026-03-20', 'pending', 'Next visit was due 20 Mar; no show recorded'),
(8, 1, 3, 'reminder', 'ANC reminder — Ange Iradukunda', '2026-07-20', 'pending', 'Upcoming ANC appointment reminder'),
(6, 1, 3, 'missed_pnc_day7', 'Day 7 PNC follow-up due', '2026-07-22', 'pending', 'Home visit for postpartum check'),
(7, 1, 3, 'home_visit', 'High-risk PNC home visit', '2026-07-18', 'in_progress', 'Post-PPH mother — monitor bleeding and recovery');
