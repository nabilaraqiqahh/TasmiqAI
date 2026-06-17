@echo off
setlocal

echo =============================================
echo   TasmiqAI Backend Server
echo =============================================
echo.

:: Load Gemini key from .env file automatically
for /f "tokens=1,* delims==" %%a in ('type .env ^| findstr "GEMINI_API_KEY"') do (
    set GEMINI_API_KEY=%%b
)
for /f "tokens=1,* delims==" %%a in ('type .env ^| findstr "SUPABASE_URL"') do (
    set SUPABASE_URL=%%b
)
for /f "tokens=1,* delims==" %%a in ('type .env ^| findstr "SUPABASE_KEY"') do (
    set SUPABASE_KEY=%%b
)

if "%GEMINI_API_KEY%"=="" (
    echo [!] GEMINI_API_KEY not found in .env — AI features may be limited.
)

echo  Gemini API Key: %GEMINI_API_KEY:~0,8%...
echo  Supabase URL:   %SUPABASE_URL%
echo.

:: Show your PC IP for mobile app config
echo  Your PC IP addresses (for mobile app):
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /R "IPv4"') do (
    for /f "tokens=1" %%j in ("%%i") do echo    http://%%j:8001
)
echo.
echo  If the IP changed, update MY_PC_IP in:
echo    tasmiq-mobile\src\services\api.js
echo.
echo  Starting server on http://0.0.0.0:8001 ...
echo  Press Ctrl+C to stop.
echo =============================================
echo.

python -m uvicorn tasmiq_api:app --host 0.0.0.0 --port 8001 --reload

endlocal
