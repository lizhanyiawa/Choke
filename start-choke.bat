@echo off
setlocal
cd /d "%~dp0"
title Choke! - local dev

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [Choke!] pnpm was not found.
  echo Install Node.js and pnpm first, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [Choke!] Installing dependencies...
  call pnpm install
  if errorlevel 1 (
    echo [Choke!] pnpm install failed.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo [Choke!] WARNING: .env not found.
  echo [Choke!] Copy .env.example to .env and fill OSU_CLIENT_SECRET / SESSION_SECRET,
  echo [Choke!] otherwise osu! login will fail.
  echo.
)

echo [Choke!] Checking API on http://localhost:3100 ...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3100/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if errorlevel 1 (
  echo [Choke!] Starting API in a new window...
  start "Choke! API" cmd /k "pnpm dev:api"
) else (
  echo [Choke!] API is already running.
)

echo [Choke!] Checking web on http://localhost:5173 ...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if errorlevel 1 (
  echo [Choke!] Starting web in a new window...
  start "Choke! Web" cmd /k "pnpm dev -- --port 5173 --host localhost --strictPort"
) else (
  echo [Choke!] Web is already running.
)

start "" powershell -NoProfile -WindowStyle Hidden -Command "$ProgressPreference='SilentlyContinue'; $u = 'http://localhost:5173/'; for ($i = 0; $i -lt 120; $i++) { try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -ge 200) { Start-Process $u; break } } catch {}; Start-Sleep -Milliseconds 500 }"

echo.
echo [Choke!] API : http://localhost:3100/health
echo [Choke!] Web : http://localhost:5173/
echo [Choke!] Close the "Choke! API" and "Choke! Web" windows to stop.
echo.
timeout /t 3 >nul
exit /b 0
