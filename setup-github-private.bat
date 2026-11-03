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

rem GitHub direct is usually blocked here; reuse the Windows system proxy
rem (Clash Verge currently uses 127.0.0.1:7897).
set "SYSPROXY="
for /f "tokens=2,*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer 2^>nul') do set "SYSPROXY=%%B"
if defined CHOKE_PROXY set "SYSPROXY=%CHOKE_PROXY%"
if defined SYSPROXY (
  if /i not "%SYSPROXY:~0,7%"=="http://" set "SYSPROXY=http://%SYSPROXY%"
  set "HTTP_PROXY=%SYSPROXY%"
  set "HTTPS_PROXY=%SYSPROXY%"
  set "ALL_PROXY=%SYSPROXY%"
  echo [Choke!] Using proxy: %SYSPROXY%
  git config --global http.https://github.com.proxy "%SYSPROXY%"
  git config --global https.https://github.com.proxy "%SYSPROXY%"
) else (
  echo [Choke!] No system proxy detected; trying direct GitHub access.
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
