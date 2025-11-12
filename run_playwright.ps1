param(
    [int]$WaitSeconds = 4
)

function Stop-Server([System.Diagnostics.Process]$server) {
    if ($server -and !$server.HasExited) {
        Write-Host "Stopping Flask server (PID $($server.Id))..."
        $server | Stop-Process -Force
    }
}

function Wait-ForServer {
    param(
        [int]$Port = 5000,
        [int]$TimeoutSeconds = 10
    )
    $sw = [diagnostics.stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $test = Test-NetConnection -ComputerName '127.0.0.1' -Port $Port -WarningAction SilentlyContinue
        if ($test.TcpTestSucceeded) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

Write-Host "Starting Flask server..."
$serverProcess = Start-Process -FilePath "python" -ArgumentList "main.py" -PassThru
try {
    Write-Host "Waiting for server to accept connections..."
    if (-not (Wait-ForServer -Port 5000 -TimeoutSeconds $WaitSeconds)) {
        throw "Flask server did not become ready within $WaitSeconds seconds."
    }
    Write-Host "Running Playwright test..."
    $exitCode = & python "tests/playwright/test_shapes.py"
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
