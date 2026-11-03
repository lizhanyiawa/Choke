@echo off
setlocal
cd /d "%~dp0"
title Choke! - create private GitHub repo

set "GH="
for /f "delims=" %%G in ('where gh 2^>nul') do if not defined GH set "GH=%%G"
if not defined GH if exist "C:\Program Files\GitHub CLI\gh.exe" set "GH=C:\Program Files\GitHub CLI\gh.exe"
if not defined GH if exist "%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe" set "GH=%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe"
if not defined GH (
  echo [Choke!] GitHub CLI not found.
  echo Install it with: winget install --id GitHub.cli -e
  pause
  exit /b 1
)

"%GH%" auth status >nul 2>nul
if errorlevel 1 (
  echo [Choke!] GitHub login is required. A browser window will open.
  "%GH%" auth login --hostname github.com --git-protocol https --web
  if errorlevel 1 (
    echo [Choke!] GitHub login failed.
    pause
    exit /b 1
  )
)
"%GH%" auth setup-git >nul 2>nul

"%GH%" repo view Choke >nul 2>nul
if errorlevel 1 (
  echo [Choke!] Creating private repository Choke and pushing master...
  "%GH%" repo create Choke --private --source=. --remote=origin --push --description "Choke! osu!-themed TCG prototype"
) else (
  echo [Choke!] Repository Choke already exists. Pushing current master...
  git remote get-url origin >nul 2>nul
  if errorlevel 1 (
    "%GH%" repo set-default Choke
  )
  git push -u origin master
)

if errorlevel 1 (
  echo [Choke!] Something failed. Check the messages above.
) else (
  echo [Choke!] Done. Private repo is up to date.
)
pause
