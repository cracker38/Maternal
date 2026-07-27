# RMDP — Rwanda Maternal Digital Platform

AI-guided maternity care MVP: React + Node.js + MySQL (XAMPP).

> A midwife never asks what to do next. The system guides her through every clinical decision at the right time.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React (Vite) + React Router |
| Backend | Node.js + Express |
| Database | MySQL via XAMPP |
| CDS | Rule-based maternal risk engine (WHO/MoH-aligned thresholds) |

## Prerequisites

- XAMPP with MySQL running
- Node.js 18+

## Database setup

1. Start **Apache** (optional) and **MySQL** in XAMPP Control Panel.
2. Import schema + seed:

```bash
C:\xampp\mysql\bin\mysql.exe -u root < C:\xampp\htdocs\eric\database\schema.sql
C:\xampp\mysql\bin\mysql.exe -u root < C:\xampp\htdocs\eric\database\seed_data.sql
```

If your MySQL root user has a password, add `-p`.

3. (Optional) Reset all demo passwords to `password123`:

```bash
cd backend
npm run seed-passwords
```

## Backend

```bash
cd backend
copy .env.example .env   # or use existing .env
npm install
npm run setup:features
npm run dev
```

API: http://localhost:5001  
Health: http://localhost:5001/api/health

### Environment (`backend/.env`)

```
PORT=5001
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=rmdp
JWT_SECRET=rmdp_dev_secret_change_in_production
JWT_EXPIRES_IN=12h
CORS_ORIGIN=http://localhost:5173
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173

### Quick start (Windows)

Double-click [`start-rmdp.bat`](start-rmdp.bat) after MySQL is running in XAMPP. It applies the feature migrations, then opens API + UI in separate terminals.

After importing the baseline schema and seed data, run this one command for every RMDP feature migration and its idempotent supporting tables:

```bash
cd backend
npm run setup:features
```

Or verify the API with:

```bash
cd backend
npm run smoke
```

## Role-specific professional dashboards

Each login lands on a **responsibility-focused workspace** (not a generic dashboard).

| Role | Dashboard focus | Key sections |
|------|-----------------|--------------|
| Midwife | Daily maternal care | Today’s activities, risk center, labor ward panel, AI alerts, quick actions, performance |
| Doctor | Clinical decisions | Emergency command, high-risk review, decision queue, clinical overview, performance |
| CHW | Community follow-up | Assigned mothers, visit schedule, missed ANC/PNC, risk reporting, education |
| Facility admin | Facility operations | Overview, users, system monitoring, data quality, reports (no clinical edits) |
| District officer | District intelligence | Overview KPIs, facility comparison, analytics, geographic monitoring, actions |
| Ministry of Health | National strategy | National KPIs, risk monitoring, district ranking, predictions, policy/export |

Data is **scoped**: facility (clinical staff) · district (DHO) · national (MoH). CHWs only see tasks assigned to them.

Demo password for all users: **password123**

| Username | Role | Facility code |
|----------|------|---------------|
| midwife1 | Midwife | KGL-HC-01 |
| doctor1 | Doctor | KGL-HC-01 |
| chw1 | CHW | KGL-HC-01 |
| admin1 | Facility admin | KGL-HC-01 |
| dho1 | District officer | GSO-DH-01 |
| moh1 | Ministry of Health | (leave blank) |


## Clinical journey covered

1. Secure facility login (2FA/biometric stubs)
2. Maternity Command Center
3. Mother identification & pregnancy registration + risk score
4. Maternal digital health record (timeline + alerts)
5. Smart ANC visit → risk engine (HTN, preeclampsia, anemia, danger signs)
6. Labor admission + digital partograph with early-warning rules
7. Emergency activation + WHO checklist (timestamped)
8. Delivery + newborn documentation
9. Postpartum schedule + PPH AI alert → auto emergency checklist
10. Community missed-visit / CHW tasks
11. Facility / District / MoH analytics

## Project layout

```
eric/
  backend/          Express API
  frontend/         Vite React SPA
  database/         schema.sql + seed_data.sql
  README.md
```

## Notes

- “AI” in this MVP is a **deterministic clinical rules engine**, not machine learning.
- SMS reminders are stubbed (logged / returned in API responses).
- 2FA and biometric are UI/API stubs for production hardening later.
