$ErrorActionPreference = 'Stop'

$backendDir = "D:\Network Automation Center\backend"
$frontendDir = "D:\Network Automation Center\frontend"
$env:BACKUP_FILE_STORAGE_PATH = Join-Path $backendDir "backup-storage"

Write-Host "Starting MongoDB for local development..."
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$backendDir'; node scripts/devDb.js" -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "Starting backend API..."
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$backendDir'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "Starting frontend UI..."
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$frontendDir'; npm run dev -- --host 0.0.0.0" -WindowStyle Normal

Write-Host "" 
Write-Host "App is starting..."
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:5000/api/health"
Write-Host "Login:    http://localhost:5173/login"
Write-Host "" 
Write-Host "If needed, stop the terminals with Ctrl+C in each window."
