@echo off
setlocal
cd /d "%~dp0"
title Choke! - local preview

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

powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process 'http://127.0.0.1:5173'; exit 0 } } catch {}; exit 1"
if %errorlevel%==0 (
  echo [Choke!] Dev server is already running. Opened in your browser.
  timeout /t 2 >nul
  exit /b 0
)

echo [Choke!] Starting Vite...
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "$ProgressPreference='SilentlyContinue'; $u = 'http://127.0.0.1:5173'; for ($i = 0; $i -lt 120; $i++) { try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { Start-Process $u; break } } catch {}; Start-Sleep -Milliseconds 500 }"

call pnpm dev --port 5173 --host 127.0.0.1 --strictPort
echo.
echo [Choke!] Dev server stopped.
pause
