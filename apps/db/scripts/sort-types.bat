@echo off
REM Windows batch file for running the sort-types.js script
REM This is an alternative to the Node.js script for Windows users

node "%~dp0sort-types.js"

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error running sort-types script
    exit /b %ERRORLEVEL%
)

echo ✅ Successfully sorted object keys in types file 