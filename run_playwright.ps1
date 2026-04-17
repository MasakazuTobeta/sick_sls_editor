param(
    [int]$WaitSeconds = 15,
    [int]$Port = 5001
)

function Stop-Server($server) {
    if ($server -is [System.Management.Automation.Job]) {
        if ($server.State -notin @('Completed', 'Failed', 'Stopped')) {
            Write-Host "Stopping Flask job ($($server.Id))..."
            Stop-Job -Job $server -ErrorAction SilentlyContinue | Out-Null
        }
        Remove-Job -Job $server -Force -ErrorAction SilentlyContinue | Out-Null
    } elseif ($server -is [System.Diagnostics.Process] -and !$server.HasExited) {
        Write-Host "Stopping Flask server (PID $($server.Id))..."
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*create_app().run(port=*' -and $_.CommandLine -like '*main*' } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

function Test-PortOpen {
    param(
        [string]$TargetHost = '127.0.0.1',
        [int]$Port
    )
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($TargetHost, $Port, $null, $null)
        $success = $async.AsyncWaitHandle.WaitOne(1000, $false)
        if (-not $success) {
            return $false
        }
        $client.EndConnect($async) | Out-Null
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Wait-ForServer {
    param(
        [int]$Port = 5001,
        [int]$TimeoutSeconds = 10
    )
    $sw = [diagnostics.stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        if (Test-PortOpen -TargetHost '127.0.0.1' -Port $Port) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

Write-Host "Starting Flask server..."
$serverProcess = Start-Job -ScriptBlock {
    param(
        [string]$RepoRoot,
        [int]$ServerPort
    )
    Set-Location $RepoRoot
    python -u -c "from main import create_app; create_app().run(port=$ServerPort)"
} -ArgumentList $PSScriptRoot, $Port
try {
    Write-Host "Waiting for server to accept connections..."
    if (-not (Wait-ForServer -Port $Port -TimeoutSeconds $WaitSeconds)) {
        throw "Flask server did not become ready within $WaitSeconds seconds on port $Port."
    }
    Write-Host "Running Playwright test..."
    $env:PLAYWRIGHT_SERVER_URL = "http://127.0.0.1:$Port/?debug=1"
    & python "tests/playwright/test_shapes.py"
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Playwright test failed with exit code $exitCode."
    }
    Write-Host "Playwright test succeeded."
} catch {
    Write-Error $_
    Stop-Server $serverProcess
    exit 1
} finally {
    Stop-Server $serverProcess
}
