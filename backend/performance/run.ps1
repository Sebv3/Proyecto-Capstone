param([ValidateSet('smoke', 'load')][string]$TestProfile = 'smoke')

$ErrorActionPreference = 'Stop'
$composePath = Join-Path $PSScriptRoot 'compose.yml'
$previousProfile = $env:PERF_PROFILE
$testExitCode = 1
try {
    $env:PERF_PROFILE = $TestProfile
    docker compose -f $composePath up --build --detach --wait perf-api
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el backend aislado.' }
    docker compose -f $composePath run --rm k6
    $testExitCode = $LASTEXITCODE
} finally {
    # Only this dedicated Compose project is stopped; the development API is untouched.
    docker compose -f $composePath down --remove-orphans
    if ($LASTEXITCODE -ne 0) { $testExitCode = 1 }
    $env:PERF_PROFILE = $previousProfile
}
exit $testExitCode
