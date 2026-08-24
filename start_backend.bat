@echo off
setlocal

echo =============================================
echo   TasmiqAI Backend Server
echo =============================================
echo.

:: Load variables from .env file
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set %%a=%%b
)

if "%GEMINI_API_KEY%"=="" (
    echo [!] GEMINI_API_KEY not set — AI features will use acoustic fallback.
)
if "%JWT_SECRET%"=="" (
    echo [!] JWT_SECRET not set — tokens will be regenerated on restart.
)

echo  Gemini Key : %GEMINI_API_KEY:~0,8%...
echo  Supabase   : %SUPABASE_URL%
echo  JWT Secret : %JWT_SECRET:~0,8%...
echo.

:: Show PC IP addresses for mobile app config
echo  Your PC IP addresses (update MY_PC_IP in tasmiq-mobile\src\services\api.js):
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /R "IPv4"') do (
    for /f "tokens=1" %%j in ("%%i") do echo    http://%%j:8001
)
echo.
echo  Starting server on http://0.0.0.0:8001 (development mode)
echo  For production use: uvicorn tasmiq_api:app --host 127.0.0.1 --port 8001 --workers 2
echo  Press Ctrl+C to stop.
echo =============================================
echo.

:: Development: --reload for auto-restart on code changes
:: Production:  remove --reload, add --workers 2
python -m uvicorn tasmiq_api:app --host 0.0.0.0 --port 8001 --reload

endlocal
