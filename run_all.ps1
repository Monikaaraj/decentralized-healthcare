# AEGIS Healthcare - One-Click Launcher for Windows
# Launches Blockchain, Contracts, Backend API, Next.js Frontend, and NMC Portal

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " Starting AEGIS Decentralized Healthcare Stack " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

function Test-PortListening([int]$port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(500) -and $tcp.Connected) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
    } catch {}
    return $false
}

# 1. Hardhat Blockchain Node (port 8545)
if (Test-PortListening 8545) {
    Write-Host "[1/5] Hardhat node is already running on port 8545." -ForegroundColor Green
} else {
    Write-Host "[1/5] Starting Hardhat Local Blockchain Node (port 8545)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\contracts'; npx hardhat node --hostname 127.0.0.1"
    Write-Host "Waiting for Hardhat node to start on port 8545..." -ForegroundColor Cyan
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-PortListening 8545) {
            $ready = $true
            break
        }
    }
    if ($ready) {
        Write-Host "Hardhat node is ready!" -ForegroundColor Green
    } else {
        Write-Host "Warning: Hardhat node took too long to start." -ForegroundColor Red
    }
}

# 2. Deploy Smart Contracts
Write-Host "[2/5] Deploying Smart Contracts..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\contracts"
npx hardhat run scripts/deploy.js --network localhost
Pop-Location

# 3. FastAPI Backend (port 8000)
if (Test-PortListening 8000) {
    Write-Host "[3/5] FastAPI backend is already running on port 8000." -ForegroundColor Green
} else {
    Write-Host "[3/5] Starting FastAPI Backend (port 8000)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; ..\ai\venv\Scripts\python.exe main.py"
}

# 4. Next.js Web Frontend (port 3000)
if (Test-PortListening 3000) {
    Write-Host "[4/5] Next.js frontend is already running on port 3000." -ForegroundColor Green
} else {
    Write-Host "[4/5] Starting Next.js Web Frontend (port 3000)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npx next dev --webpack -H 127.0.0.1 -p 3000"
}

# 5. NMC & ICMR Verification Portal (port 3001)
if (Test-PortListening 3001) {
    Write-Host "[5/5] NMC / ICMR Portal is already running on port 3001." -ForegroundColor Green
} else {
    Write-Host "[5/5] Starting NMC / ICMR Portal (port 3001)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\nmc-portal'; npm run dev"
}

Write-Host "`n✨ All AEGIS-AI Services are Active:" -ForegroundColor Green
Write-Host "Main Web App:        http://localhost:3000" -ForegroundColor Cyan
Write-Host "NMC / ICMR Portal:   http://localhost:3001" -ForegroundColor Cyan
Write-Host "FastAPI AI Engine:   http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "Blockchain Node RPC: http://127.0.0.1:8545" -ForegroundColor Cyan
