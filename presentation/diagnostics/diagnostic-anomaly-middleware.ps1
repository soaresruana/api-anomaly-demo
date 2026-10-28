param(
    [string]$ExecutionId = ""
)

$BaseUrl = "http://localhost:8000"

# Gera um identificador unico por execucao.
# Isso evita reutilizar historico comportamental de testes anteriores.
if ([string]::IsNullOrWhiteSpace($ExecutionId)) {
    $ExecutionId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
}

$NormalRunId = "demo-normal-$ExecutionId"
$NormalClientId = "usuario-normal-$ExecutionId"
$AnomalyRunId = "demo-query-$ExecutionId"
$AnomalyClientId = "usuario-query-$ExecutionId"

$LoginPayload = @{
    username = "demo-user"
    password = "demo-password"
} | ConvertTo-Json -Compress

function Invoke-PostJson {
    param(
        [string]$Label,
        [string]$Path,
        [hashtable]$Headers
    )

    $Uri = "$BaseUrl$Path"

    Write-Host ""
    Write-Host "[$Label]"
    Write-Host "POST $Path"

    try {
        $response = Invoke-WebRequest `
            -Uri $Uri `
            -Method POST `
            -Headers $Headers `
            -ContentType "application/json" `
            -Body $LoginPayload `
            -UseBasicParsing

        $status = [int]$response.StatusCode
        Write-Host "HTTP $status"
        return $status
    }
    catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $status = [int]$_.Exception.Response.StatusCode
            Write-Host "HTTP $status"
            return $status
        }

        Write-Host "ERRO: $($_.Exception.Message)"
        return -1
    }
}

function Invoke-Get {
    param(
        [string]$Label,
        [string]$Path,
        [hashtable]$Headers
    )

    $Uri = "$BaseUrl$Path"

    Write-Host ""
    Write-Host "[$Label]"
    Write-Host "GET $Path"

    $args = @(
        "-s",
        "-o", "NUL",
        "-w", "%{http_code}",
        "-X", "GET"
    )

    foreach ($key in $Headers.Keys) {
        $args += @("-H", "$key`: $($Headers[$key])")
    }

    $args += $Uri

    $statusText = & curl.exe @args
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Write-Host "ERRO curl.exe (exit code $exitCode)"
        return -1
    }

    $status = 0
    if (-not [int]::TryParse(($statusText | Out-String).Trim(), [ref]$status)) {
        Write-Host "ERRO: resposta HTTP inesperada: $statusText"
        return -1
    }

    Write-Host "HTTP $status"
    return $status
}

function Wait-Ms {
    param([int]$Milliseconds)
    Start-Sleep -Milliseconds $Milliseconds
}

$NormalHeaders = @{
    "X-Experiment-Run-Id"    = $NormalRunId
    "X-Experiment-Client-Id" = $NormalClientId
}

$AnomalyHeaders = @{
    "X-Experiment-Run-Id"    = $AnomalyRunId
    "X-Experiment-Client-Id" = $AnomalyClientId
}

Write-Host "============================================================"
Write-Host "DEMO - Middleware de Deteccao de Anomalias em APIs"
Write-Host "Execucao: $ExecutionId"
Write-Host "============================================================"

Write-Host ""
Write-Host "=== ETAPA 1 - ESTABELECIMENTO DO PERFIL NORMAL ==="
Write-Host "Run ID   : $NormalRunId"
Write-Host "Client ID: $NormalClientId"

# Primeira observacao: deve ser tratada como warm-up em um contexto novo.
Invoke-PostJson "N1 - Warm-up inicial" "/auth/login" $NormalHeaders | Out-Null
Wait-Ms 1420

# Pode ocorrer falso positivo nesta etapa inicial.
Invoke-Get "N2 - Formacao de historico" "/products?page=1&category=electronics" $NormalHeaders | Out-Null
Wait-Ms 1007

Invoke-Get "N3 - Formacao de historico" "/products/1" $NormalHeaders | Out-Null
Wait-Ms 1028

Invoke-Get "N4 - Formacao de historico" "/products/2" $NormalHeaders | Out-Null
Wait-Ms 1766

Write-Host ""
Write-Host "=== ETAPA 2 - DEMONSTRACAO DO COMPORTAMENTO NORMAL ==="

$normalLoginStatus = Invoke-PostJson "N5 - Login do perfil conhecido" "/auth/login" $NormalHeaders
Wait-Ms 980

$normalNavigationStatus = Invoke-Get "N6 - Navegacao normal" "/products?page=1" $NormalHeaders

Write-Host ""
Write-Host "=== ETAPA 3 - CENARIO ANOMALO: QUERY PARAMETERS ==="
Write-Host "Run ID   : $AnomalyRunId"
Write-Host "Client ID: $AnomalyClientId"

# Contexto independente e novo.
# Primeira requisicao funciona apenas como warm-up do cliente.
$anomalyWarmupStatus = Invoke-Get "A1 - Warm-up do perfil anomalo" "/products/1" $AnomalyHeaders
Wait-Ms 1220

$anomalyStatus = Invoke-Get `
    "A2 - Requisicao com 10 query params" `
    "/products?page=1" `
    $AnomalyHeaders
Wait-Ms 1100

$anomalyOtherAStatus = Invoke-Get "A3 - Outra requisicao anomala" "/products?p1=1&p2=2&p3=3&p4=4&p5=5" $AnomalyHeaders

Wait-Ms 1050

$anomalyOtherBStatus = Invoke-Get "A4 - Outra requisicao anomala" "/products?page=1&category=electronics&p1=1&p2=2&p3=3&p4=4&p5=5" $AnomalyHeaders


Write-Host ""
Write-Host "============================================================"
Write-Host "RESULTADO PRINCIPAL"
Write-Host "Normal - login             : HTTP $normalLoginStatus"
Write-Host "Normal - /products?page=1  : HTTP $normalNavigationStatus"
Write-Host "Anomalo - 10 query params  : HTTP $anomalyStatus"
Write-Host "Anomalo - outra requisicao A : HTTP $anomalyOtherAStatus"
Write-Host "Anomalo - outra requisicao B : HTTP $anomalyOtherBStatus"

Write-Host "============================================================"

$normalOk = ($normalLoginStatus -eq 200) -and ($normalNavigationStatus -eq 200)
$anomalyWarmupOk = ($anomalyWarmupStatus -eq 200)
$anomalyOk = ($anomalyStatus -eq 403)

if ($normalOk -and $anomalyWarmupOk -and $anomalyOk) {
    Write-Host "DEMO OK"
    Write-Host "- perfil normal permitido"
    Write-Host "- perfil anomalo inicializado corretamente"
    Write-Host "- requisicao com 10 query params bloqueada"
    exit 0
}

Write-Host "DEMO NAO REPRODUZIU COMPLETAMENTE O RESULTADO ESPERADO."

if (-not $normalOk) {
    Write-Host "- Esperado no perfil normal: HTTP 200 no login e em /products?page=1"
}

if (-not $anomalyWarmupOk) {
    Write-Host "- Warm-up do perfil anomalo deveria retornar HTTP 200 em contexto novo"
    Write-Host "  Verifique se os IDs realmente sao novos."
}

if (-not $anomalyOk) {
    Write-Host "- Esperado no cenario anomalo: HTTP 403 na requisicao com 10 query params"
}

Write-Host "Use os Run IDs exibidos acima para consultar os logs."
exit 1
