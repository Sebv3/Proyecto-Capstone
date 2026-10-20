# Disposable booking/payment integration stack. No shared Supabase access or migrations.
param([string]$PostgresImage = 'public.ecr.aws/supabase/postgres:17.6.1.166')
$ErrorActionPreference = 'Stop'
$reviewRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$reviewSupabase = Join-Path $reviewRoot 'supabase'
$reviewNetwork = 'servimatch-sprint4-review'
$reviewPg = 'servimatch-sprint4-review-pg'
$reviewRest = 'servimatch-sprint4-review-rest'
$createdNetwork = $false
$createdPg = $false
$createdRest = $false
$connectedApi = $false

function Invoke-TestDocker {
    param([string[]]$DockerArgs)
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker failed: $($DockerArgs[0])" }
}

Push-Location $reviewRoot
try {
    foreach ($reviewName in @($reviewPg, $reviewRest)) {
        $existing = Invoke-TestDocker -DockerArgs @('container','ls','-aq','--filter',"name=^/$reviewName`$")
        if ($existing) { throw "Test container already exists: $reviewName" }
    }
    $existingNetworks = Invoke-TestDocker -DockerArgs @('network','ls','--format','{{.Name}}')
    if ($existingNetworks -contains $reviewNetwork) { throw "Test network already exists: $reviewNetwork" }
    $reviewApi = ([string](Invoke-TestDocker -DockerArgs @('compose','ps','-q','api'))).Trim()
    if (-not $reviewApi) { throw 'Start the project API with docker compose up first.' }

    Invoke-TestDocker -DockerArgs @('network','create',$reviewNetwork) | Out-Null
    $createdNetwork = $true
    Invoke-TestDocker -DockerArgs @(
        'run','-d','--pull=never','--name',$reviewPg,'--network',$reviewNetwork,
        '--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_PASSWORD=sprint4-local-test',
        '--mount',"type=bind,source=$reviewSupabase,target=/fixtures,readonly",
        '--entrypoint','docker-entrypoint.sh',$PostgresImage,
        'postgres','-c','listen_addresses=*'
    ) | Out-Null
    $createdPg = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        # The initialization server accepts only Unix sockets; wait for the final TCP server.
        & docker exec $reviewPg pg_isready -h 127.0.0.1 -U postgres 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Temporary PostgreSQL did not become ready.' }
    Invoke-TestDocker -DockerArgs @('exec',$reviewPg,'psql','-U','postgres','-v','ON_ERROR_STOP=1',
                                  '-c','CREATE DATABASE sprint4_review') | Out-Null
    Invoke-TestDocker -DockerArgs @('exec',$reviewPg,'psql','-U','postgres','-v','ON_ERROR_STOP=1',
        '-c', 'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=''anon'') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=''authenticated'') THEN CREATE ROLE authenticated; END IF; END $$;') | Out-Null
    $fixture = Get-Content -LiteralPath (Join-Path $reviewSupabase 'tests/certifications_fixture.sql') |
        Where-Object { $_ -notmatch '^create role ' }
    $fixture | & docker exec -i $reviewPg psql -U postgres -d sprint4_review -v ON_ERROR_STOP=1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Test fixture failed.' }
    $migrationArgs = @('exec',$reviewPg,'psql','-U','postgres','-d','sprint4_review','-v','ON_ERROR_STOP=1')
    foreach ($file in @(
        'migrations/20261005120000_worker_certifications.sql',
        'migrations/20261005180000_service_locations.sql',
        'migrations/20261006200000_align_public_service_visibility.sql',
        'migrations/20261006210000_create_bookings.sql',
        'migrations/20261006220000_booking_operations.sql',
        'migrations/20261009200000_fix_booking_conflict_errors.sql',
        'tests/booking_operations_rules.sql',
        'tests/booking_http_fixture.sql',
        'migrations/20261010120000_booking_client_and_service_commune.sql',
        'migrations/20261010160000_worker_owned_workshop_commune.sql',
        'migrations/20261013120000_simulated_payments.sql',
        'tests/payments_rules.sql',
        'tests/payment_http_setup.sql',
        'migrations/20261013200000_client_confirmation_worker_completion.sql',
        'tests/client_confirmation_rules.sql',
        'migrations/20261013210000_temporary_service_chat.sql',
        'tests/temporary_chat_rules.sql',
        'migrations/20261013220000_service_reviews.sql',
        'tests/reviews_rules.sql',
        'migrations/20261016120000_worker_earnings.sql',
        'tests/earnings_rules.sql',
        'tests/mercadopago_role_fixture.sql',
        'migrations/20261017220000_mercadopago_test_checkout.sql',
        'tests/mercadopago_rules.sql',
        'migrations/20261019120000_profile_avatars.sql',
        'tests/profile_avatars_rules.sql'
    )) { $migrationArgs += @('-f',"/fixtures/$file") }
    Invoke-TestDocker -DockerArgs $migrationArgs | Out-Null
    Invoke-TestDocker -DockerArgs @('exec',$reviewPg,'psql','-U','postgres','-v','ON_ERROR_STOP=1',
                                  '-c','CREATE DATABASE notifications_review') | Out-Null
    Invoke-TestDocker -DockerArgs @('exec',$reviewPg,'psql','-U','postgres','-d','notifications_review',
                                  '-v','ON_ERROR_STOP=1','-f','/fixtures/tests/notifications_rules.sql') | Out-Null
    Invoke-TestDocker -DockerArgs @('network','connect',$reviewNetwork,$reviewApi)
    $connectedApi = $true
    Invoke-TestDocker -DockerArgs @(
        'run','-d','--pull=never','--name',$reviewRest,'--network',$reviewNetwork,
        '-e',"PGRST_DB_URI=postgres://postgres:sprint4-local-test@${reviewPg}:5432/sprint4_review",
        '-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon',
        '-e','PGRST_JWT_SECRET=servimatch-sprint4-isolated-jwt-test-secret-only',
        'public.ecr.aws/supabase/postgrest:v14.5'
    ) | Out-Null
    $createdRest = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & docker compose exec -T api python -c "import httpx; r=httpx.get('http://servimatch-sprint4-review-rest:3000/'); exit(0 if r.status_code==200 else 1)" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Temporary PostgREST did not become ready.' }
    Invoke-TestDocker -DockerArgs @('compose','exec','-T','-e',
        'BOOKING_INTEGRATION_URL=http://servimatch-sprint4-review-rest:3000',
        'api','pytest','tests/test_booking_states.py','tests/test_booking_integration.py')
} finally {
    if ($createdRest) { & docker rm -f $reviewRest | Out-Null }
    if ($connectedApi) { & docker network disconnect $reviewNetwork $reviewApi | Out-Null }
    if ($createdPg) { & docker rm -f $reviewPg | Out-Null }
    if ($createdNetwork) { & docker network rm $reviewNetwork | Out-Null }
    Pop-Location
}
