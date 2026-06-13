param(
    [Parameter(Mandatory = $true)]
    [string]$FunctionName,

    [string]$Region = "us-east-1",

    [string]$AllowedOrigin = "*",

    [string]$RoleArn = "",

    [string]$ReportsBucket = "",

    [string]$ReportsPrefix = "softball",

    [string]$Season = "2026"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceFile = Join-Path $projectRoot "aws\lambdas\softball-lineup\index.mjs"
$buildDir = Join-Path $projectRoot ".deploy"
$zipPath = Join-Path $buildDir "softball-lineup.zip"
$envPath = Join-Path $buildDir "softball-lineup-env.json"
$corsPath = Join-Path $buildDir "softball-lineup-cors.json"

function Invoke-Aws {
    & aws @args
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($args -join ' ')"
    }
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI is not installed or not on PATH."
}

if (-not (Test-Path $sourceFile)) {
    throw "Lambda source not found at $sourceFile"
}

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path $sourceFile -DestinationPath $zipPath -Force

$functionExists = $true
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& aws lambda get-function `
    --function-name $FunctionName `
    --region $Region 2>$null | Out-Null
$ErrorActionPreference = $previousErrorActionPreference
if ($LASTEXITCODE -ne 0) {
    $functionExists = $false
}

$envPayload = @{
    Variables = @{
        SOFTBALL_REPORTS_BUCKET = $ReportsBucket
        SOFTBALL_REPORTS_PREFIX = $ReportsPrefix
        SOFTBALL_SEASON = $Season
        ALLOWED_ORIGIN = $AllowedOrigin
    }
} | ConvertTo-Json -Compress
Write-Utf8NoBom -Path $envPath -Value $envPayload

if ($functionExists) {
    Invoke-Aws lambda update-function-code `
        --function-name $FunctionName `
        --region $Region `
        --zip-file ("fileb://" + $zipPath) | Out-Null

    Invoke-Aws lambda update-function-configuration `
        --function-name $FunctionName `
        --region $Region `
        --environment ("file://" + $envPath) | Out-Null
} else {
    if (-not $RoleArn) {
        throw "Lambda function $FunctionName does not exist. Provide -RoleArn to create it."
    }

    Invoke-Aws lambda create-function `
        --function-name $FunctionName `
        --runtime nodejs22.x `
        --role $RoleArn `
        --handler index.handler `
        --timeout 30 `
        --memory-size 256 `
        --region $Region `
        --environment ("file://" + $envPath) `
        --zip-file ("fileb://" + $zipPath) | Out-Null
}

Write-Host "Deployed $FunctionName from $sourceFile"

$functionUrl = ""
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$functionUrlOutput = & aws lambda get-function-url-config `
    --function-name $FunctionName `
    --region $Region `
    --query "FunctionUrl" `
    --output text 2>$null
$ErrorActionPreference = $previousErrorActionPreference
if ($LASTEXITCODE -ne 0) {
    $functionUrl = ""
} else {
    $functionUrl = ($functionUrlOutput | Select-Object -First 1)
}

$corsPayload = @{
    AllowOrigins = @($AllowedOrigin)
    AllowMethods = @("POST")
    AllowHeaders = @("content-type")
    MaxAge = 3600
} | ConvertTo-Json -Compress
Write-Utf8NoBom -Path $corsPath -Value $corsPayload

if (-not $functionUrl -or $functionUrl -eq "None") {
    $functionUrl = Invoke-Aws lambda create-function-url-config `
        --function-name $FunctionName `
        --auth-type NONE `
        --cors ("file://" + $corsPath) `
        --region $Region `
        --query "FunctionUrl" `
        --output text
} else {
    Invoke-Aws lambda update-function-url-config `
        --function-name $FunctionName `
        --auth-type NONE `
        --cors ("file://" + $corsPath) `
        --region $Region | Out-Null
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& aws lambda add-permission `
    --function-name $FunctionName `
    --statement-id "softball-lineup-function-url" `
    --action lambda:InvokeFunctionUrl `
    --principal "*" `
    --function-url-auth-type NONE `
    --region $Region | Out-Null
$ErrorActionPreference = $previousErrorActionPreference
if ($LASTEXITCODE -ne 0) {
    Write-Host "Permission may already exist; continuing."
}

Write-Host "Function URL: $functionUrl"
