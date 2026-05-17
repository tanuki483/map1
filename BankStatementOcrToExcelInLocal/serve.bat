@echo off
echo ========================================
echo  Bank Statement OCR Tool - Local Server
echo ========================================
echo.
echo Starting browser at http://localhost:8080 ...
start http://localhost:8080
py "%~dp0serve.py"
pause
