@echo off
node "%~dp0package-update.js" %*
exit /b %errorlevel%
