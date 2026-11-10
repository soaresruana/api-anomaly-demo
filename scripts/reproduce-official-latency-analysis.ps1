[CmdletBinding()]
param(
    [string]$OfficialDir = (Join-Path $PSScriptRoot "..\results\latency\official")
)

$ErrorActionPreference = "Stop"

function Get-Percentile {
    param(
        [Parameter(Mandatory)]
        [double[]]$Values,

        [Parameter(Mandatory)]
        [ValidateRange(0.0, 1.0)]
        [double]$P
    )

    if ($Values.Count -eq 0) {
        throw "Cannot calculate percentile from an empty set."
    }

    $sorted = @($Values | Sort-Object)
    if ($sorted.Count -eq 1) {
        return [double]$sorted[0]
    }

    $position = ($sorted.Count - 1) * $P
    $lower = [math]::Floor($position)
    $upper = [math]::Ceiling($position)

    if ($lower -eq $upper) {
        return [double]$sorted[$lower]
    }

    $weight = $position - $lower
    return [double](
        $sorted[$lower] +
        (($sorted[$upper] - $sorted[$lower]) * $weight)
    )
}

function Get-SampleStdDev {
    param([Parameter(Mandatory)][double[]]$Values)

    if ($Values.Count -lt 2) {
        return 0.0
    }

    $mean = ($Values | Measure-Object -Average).Average
    $sumSquares = 0.0

    foreach ($value in $Values) {
        $sumSquares += [math]::Pow(($value - $mean), 2)
    }

    return [math]::Sqrt($sumSquares / ($Values.Count - 1))
}

function Get-DescriptiveStats {
    param([Parameter(Mandatory)][double[]]$Values)

    $measure = $Values | Measure-Object -Average -Minimum -Maximum

    [pscustomobject]@{
        N      = $Values.Count
        Mean   = [double]$measure.Average
        Median = Get-Percentile -Values $Values -P 0.50
        P95    = Get-Percentile -Values $Values -P 0.95
        P99    = Get-Percentile -Values $Values -P 0.99
        Min    = [double]$measure.Minimum
        Max    = [double]$measure.Maximum
        StdDev = Get-SampleStdDev -Values $Values
    }
}

function Get-MeasuredLatencyValues {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Official latency file not found: $Path"
    }

    $values = [System.Collections.Generic.List[double]]::new()
    $lineNumber = 0

    foreach ($line in Get-Content -LiteralPath $Path) {
        $lineNumber++

        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        try {
            $record = $line | ConvertFrom-Json -ErrorAction Stop
        }
        catch {
            throw "Invalid JSON in '$Path' at line $lineNumber. $($_.Exception.Message)"
        }

        if (
            $record.type -eq "Point" -and
            $record.metric -eq "measured_http_req_duration"
        ) {
            if ($null -eq $record.data -or $null -eq $record.data.value) {
                throw "Measured latency point without data.value in '$Path' at line $lineNumber."
            }

            $null = $values.Add([double]$record.data.value)
        }
    }

    return $values.ToArray()
}

function Format-2 {
    param([double]$Value)
    return $Value.ToString("F2", [System.Globalization.CultureInfo]::InvariantCulture)
}

function Test-RoundedValue {
    param(
        [double]$Actual,
        [double]$Expected
    )

    return ([math]::Round($Actual, 2) -eq [math]::Round($Expected, 2))
}

Write-Host ""
Write-Host "============================================================"
Write-Host " OFFICIAL LATENCY ANALYSIS REPRODUCTION"
Write-Host "============================================================"
Write-Host ""

$officialPath = (Resolve-Path -LiteralPath $OfficialDir).Path
Write-Host "Official dataset directory:"
Write-Host "  $officialPath"
Write-Host ""

$profiles = @("p0", "p1", "p2")
$blocks = 1..5

$allValues = @{
    p0 = [System.Collections.Generic.List[double]]::new()
    p1 = [System.Collections.Generic.List[double]]::new()
    p2 = [System.Collections.Generic.List[double]]::new()
}

$blockMeans = @{}

Write-Host "1. Validating the 15 official execution files..."
Write-Host ""

foreach ($block in $blocks) {
    $blockKey = "block-{0:D2}" -f $block
    $blockMeans[$blockKey] = @{}

    foreach ($profile in $profiles) {
        $fileName = "{0}-{1}.json" -f $blockKey, $profile
        $filePath = Join-Path $officialPath $fileName

        $values = @(Get-MeasuredLatencyValues -Path $filePath)

        if ($values.Count -ne 100) {
            throw "$fileName contains $($values.Count) measured points; expected exactly 100."
        }

        foreach ($value in $values) {
            $null = $allValues[$profile].Add($value)
        }

        $blockMean = ($values | Measure-Object -Average).Average
        $blockMeans[$blockKey][$profile] = [double]$blockMean

        Write-Host ("  OK  {0,-20} measured points: {1}" -f $fileName, $values.Count)
    }
}

Write-Host ""
Write-Host "Validated: 15 files x 100 measurements = 1,500 official observations."
Write-Host ""

Write-Host "2. Recalculating descriptive statistics by profile..."
Write-Host ""

$profileStats = @{}

foreach ($profile in $profiles) {
    $values = @($allValues[$profile].ToArray())

    if ($values.Count -ne 500) {
        throw "Profile $profile contains $($values.Count) measurements; expected exactly 500."
    }

    $profileStats[$profile] = Get-DescriptiveStats -Values $values
}

$profileRows = foreach ($profile in $profiles) {
    $s = $profileStats[$profile]

    [pscustomobject]@{
        Profile = $profile.ToUpper()
        N       = $s.N
        MeanMs  = Format-2 $s.Mean
        Median  = Format-2 $s.Median
        P95     = Format-2 $s.P95
        P99     = Format-2 $s.P99
        Min     = Format-2 $s.Min
        Max     = Format-2 $s.Max
        StdDev  = Format-2 $s.StdDev
    }
}

$profileRows | Format-Table -AutoSize

Write-Host ""
Write-Host "3. Recalculating paired overhead by experimental block..."
Write-Host ""

$gatewayOverhead = [System.Collections.Generic.List[double]]::new()
$analysisOverhead = [System.Collections.Generic.List[double]]::new()
$totalOverhead = [System.Collections.Generic.List[double]]::new()

$blockRows = foreach ($block in $blocks) {
    $blockKey = "block-{0:D2}" -f $block

    $p0 = [double]$blockMeans[$blockKey]["p0"]
    $p1 = [double]$blockMeans[$blockKey]["p1"]
    $p2 = [double]$blockMeans[$blockKey]["p2"]

    $gateway = $p1 - $p0
    $analysis = $p2 - $p1
    $total = $p2 - $p0

    $null = $gatewayOverhead.Add($gateway)
    $null = $analysisOverhead.Add($analysis)
    $null = $totalOverhead.Add($total)

    [pscustomobject]@{
        Block      = $blockKey
        P0MeanMs   = Format-2 $p0
        P1MeanMs   = Format-2 $p1
        P2MeanMs   = Format-2 $p2
        GatewayMs  = Format-2 $gateway
        AnalysisMs = Format-2 $analysis
        TotalMs    = Format-2 $total
    }
}

$blockRows | Format-Table -AutoSize

function Get-PairedOverheadStats {
    param([Parameter(Mandatory)][double[]]$Values)

    $stats = Get-DescriptiveStats -Values $Values
    $tCritical = 2.7764451051977987
    $margin = $tCritical * $stats.StdDev / [math]::Sqrt($Values.Count)

    [pscustomobject]@{
        Mean   = $stats.Mean
        Median = $stats.Median
        StdDev = $stats.StdDev
        CILow  = $stats.Mean - $margin
        CIHigh = $stats.Mean + $margin
    }
}

$gatewayStats = Get-PairedOverheadStats -Values @($gatewayOverhead.ToArray())
$analysisStats = Get-PairedOverheadStats -Values @($analysisOverhead.ToArray())
$totalStats = Get-PairedOverheadStats -Values @($totalOverhead.ToArray())

$overheadRows = @(
    [pscustomobject]@{
        Comparison = "P1 - P0 (Gateway)"
        MeanMs     = Format-2 $gatewayStats.Mean
        MedianMs   = Format-2 $gatewayStats.Median
        StdDevMs   = Format-2 $gatewayStats.StdDev
        CI95       = "$(Format-2 $gatewayStats.CILow) to $(Format-2 $gatewayStats.CIHigh)"
    },
    [pscustomobject]@{
        Comparison = "P2 - P1 (Analysis middleware)"
        MeanMs     = Format-2 $analysisStats.Mean
        MedianMs   = Format-2 $analysisStats.Median
        StdDevMs   = Format-2 $analysisStats.StdDev
        CI95       = "$(Format-2 $analysisStats.CILow) to $(Format-2 $analysisStats.CIHigh)"
    },
    [pscustomobject]@{
        Comparison = "P2 - P0 (Complete solution)"
        MeanMs     = Format-2 $totalStats.Mean
        MedianMs   = Format-2 $totalStats.Median
        StdDevMs   = Format-2 $totalStats.StdDev
        CI95       = "$(Format-2 $totalStats.CILow) to $(Format-2 $totalStats.CIHigh)"
    }
)

$overheadRows | Format-Table -AutoSize

Write-Host ""
Write-Host "4. Comparing recalculated values with the values reported in the article..."
Write-Host ""

$checks = @(
    @{ Label = "P0 mean"; Actual = $profileStats["p0"].Mean; Expected = 10.82 },
    @{ Label = "P1 mean"; Actual = $profileStats["p1"].Mean; Expected = 13.42 },
    @{ Label = "P2 mean"; Actual = $profileStats["p2"].Mean; Expected = 75.06 },

    @{ Label = "P0 median"; Actual = $profileStats["p0"].Median; Expected = 10.06 },
    @{ Label = "P1 median"; Actual = $profileStats["p1"].Median; Expected = 14.14 },
    @{ Label = "P2 median"; Actual = $profileStats["p2"].Median; Expected = 63.96 },

    @{ Label = "P0 P95"; Actual = $profileStats["p0"].P95; Expected = 19.26 },
    @{ Label = "P1 P95"; Actual = $profileStats["p1"].P95; Expected = 26.09 },
    @{ Label = "P2 P95"; Actual = $profileStats["p2"].P95; Expected = 101.02 },

    @{ Label = "P0 P99"; Actual = $profileStats["p0"].P99; Expected = 26.73 },
    @{ Label = "P1 P99"; Actual = $profileStats["p1"].P99; Expected = 32.14 },
    @{ Label = "P2 P99"; Actual = $profileStats["p2"].P99; Expected = 371.41 },

    @{ Label = "P0 minimum"; Actual = $profileStats["p0"].Min; Expected = 1.74 },
    @{ Label = "P1 minimum"; Actual = $profileStats["p1"].Min; Expected = 2.95 },
    @{ Label = "P2 minimum"; Actual = $profileStats["p2"].Min; Expected = 33.95 },

    @{ Label = "P0 maximum"; Actual = $profileStats["p0"].Max; Expected = 338.29 },
    @{ Label = "P1 maximum"; Actual = $profileStats["p1"].Max; Expected = 39.36 },
    @{ Label = "P2 maximum"; Actual = $profileStats["p2"].Max; Expected = 884.99 },

    @{ Label = "P0 stddev"; Actual = $profileStats["p0"].StdDev; Expected = 15.79 },
    @{ Label = "P1 stddev"; Actual = $profileStats["p1"].StdDev; Expected = 7.07 },
    @{ Label = "P2 stddev"; Actual = $profileStats["p2"].StdDev; Expected = 73.94 },

    @{ Label = "Gateway overhead mean"; Actual = $gatewayStats.Mean; Expected = 2.60 },
    @{ Label = "Analysis overhead mean"; Actual = $analysisStats.Mean; Expected = 61.64 },
    @{ Label = "Total overhead mean"; Actual = $totalStats.Mean; Expected = 64.24 },

    @{ Label = "Gateway overhead median"; Actual = $gatewayStats.Median; Expected = 3.26 },
    @{ Label = "Analysis overhead median"; Actual = $analysisStats.Median; Expected = 60.32 },
    @{ Label = "Total overhead median"; Actual = $totalStats.Median; Expected = 63.58 },

    @{ Label = "Gateway overhead stddev"; Actual = $gatewayStats.StdDev; Expected = 1.53 },
    @{ Label = "Analysis overhead stddev"; Actual = $analysisStats.StdDev; Expected = 5.40 },
    @{ Label = "Total overhead stddev"; Actual = $totalStats.StdDev; Expected = 6.30 },

    @{ Label = "Gateway CI95 low"; Actual = $gatewayStats.CILow; Expected = 0.70 },
    @{ Label = "Gateway CI95 high"; Actual = $gatewayStats.CIHigh; Expected = 4.50 },
    @{ Label = "Analysis CI95 low"; Actual = $analysisStats.CILow; Expected = 54.93 },
    @{ Label = "Analysis CI95 high"; Actual = $analysisStats.CIHigh; Expected = 68.34 },
    @{ Label = "Total CI95 low"; Actual = $totalStats.CILow; Expected = 56.41 },
    @{ Label = "Total CI95 high"; Actual = $totalStats.CIHigh; Expected = 72.07 }
)

$failed = 0

foreach ($check in $checks) {
    $ok = Test-RoundedValue -Actual $check.Actual -Expected $check.Expected
    $status = if ($ok) { "PASS" } else { "FAIL" }

    if (-not $ok) {
        $failed++
    }

    Write-Host (
        "  {0,-4} {1,-30} actual={2,8} expected={3,8}" -f
        $status,
        $check.Label,
        (Format-2 $check.Actual),
        (Format-2 $check.Expected)
    )
}

Write-Host ""

if ($failed -gt 0) {
    throw "$failed published-value check(s) did not match at two decimal places."
}

Write-Host "============================================================"
Write-Host " REPRODUCTION SUCCESSFUL"
Write-Host " All 1,500 official latency observations were reanalyzed."
Write-Host " All published latency values match at two decimal places."
Write-Host "============================================================"
Write-Host ""
