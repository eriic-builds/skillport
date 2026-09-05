@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Skillport requires Node.js 20 or newer. Install Node.js and retry. 1>&2
  exit /b 1
)
node "%~dp0skills.mjs" %*
exit /b %errorlevel%
