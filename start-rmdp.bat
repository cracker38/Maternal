@echo off
title RMDP — Rwanda Maternal Digital Platform
cd /d "%~dp0"

echo.
echo  RMDP startup
echo  -------------

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Install Node 18+ and retry.
  pause
  exit /b 1
)

if not exist "C:\xampp\mysql\bin\mysql.exe" (
  echo Warning: XAMPP MySQL not found at default path.
  echo Ensure MySQL is running before using the app.
) else (
  "C:\xampp\mysql\bin\mysql.exe" -u root -e "USE rmdp; SELECT 1;" >nul 2>&1
  if errorlevel 1 (
    echo Database 'rmdp' missing or MySQL not running.
    echo Start MySQL in XAMPP, then run:
    echo   C:\xampp\mysql\bin\mysql.exe -u root ^< database\schema.sql
    echo   C:\xampp\mysql\bin\mysql.exe -u root ^< database\seed_data.sql
    pause
    exit /b 1
  )
)

echo Applying RMDP feature migrations ...
call npm.cmd --prefix "%~dp0backend" run setup:features
if errorlevel 1 (
  echo Database migration failed. Resolve the error above before starting RMDP.
  pause
  exit /b 1
)

echo Starting API on http://localhost:5001 ...
start "RMDP API" cmd /k "cd /d "%~dp0backend" && set PORT=5001 && npm.cmd run start"

timeout /t 2 /nobreak >nul

echo Starting UI on http://localhost:5173 ...
start "RMDP Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo  Login demos (password: password123)
echo    midwife1 / KGL-HC-01
echo    doctor1  / KGL-HC-01
echo    chw1     / KGL-HC-01
echo    admin1   / KGL-HC-01
echo    dho1     / GSO-DH-01
echo    moh1     (no facility code)
echo.
echo  Open http://localhost:5173
echo.
pause
