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
try {
    aws lambda get-function `
        --function-name $FunctionName `
        --region $Region | Out-Null
} catch {
    $functionExists = $false
}

$envJson = "{`"Variables`":{`"SOFTBALL_REPORTS_BUCKET`":`"$ReportsBucket`",`"SOFTBALL_REPORTS_PREFIX`":`"$ReportsPrefix`",`"SOFTBALL_SEASON`":`"$Season`",`"ALLOWED_ORIGIN`":`"$AllowedOrigin`"}}"

if ($functionExists) {
    aws lambda update-function-code `
        --function-name $FunctionName `
        --region $Region `
        --zip-file ("fileb://" + $zipPath) | Out-Null

    aws lambda update-function-configuration `
        --function-name $FunctionName `
        --region $Region `
        --environment $envJson | Out-Null
} else {
    if (-not $RoleArn) {
        throw "Lambda function $FunctionName does not exist. Provide -RoleArn to create it."
    }

    aws lambda create-function `
        --function-name $FunctionName `
        --runtime nodejs22.x `
        --role $RoleArn `
        --handler index.handler `
        --timeout 30 `
        --memory-size 256 `
        --region $Region `
        --environment $envJson `
        --zip-file ("fileb://" + $zipPath) | Out-Null
}

Write-Host "Deployed $FunctionName from $sourceFile"

$functionUrl = ""
try {
    $functionUrl = aws lambda get-function-url-config `
        --function-name $FunctionName `
        --region $Region `
        --query "FunctionUrl" `
        --output text
} catch {
    $functionUrl = ""
}

if (-not $functionUrl -or $functionUrl -eq "None") {
    $corsJson = "{`"AllowOrigins`":[`"$AllowedOrigin`"],`"AllowMethods`":[`"POST`"],`"AllowHeaders`":[`"content-type`"],`"MaxAge`":3600}"
    $functionUrl = aws lambda create-function-url-config `
        --function-name $FunctionName `
        --auth-type NONE `
        --cors $corsJson `
        --region $Region `
        --query "FunctionUrl" `
        --output text
} else {
    $corsJson = "{`"AllowOrigins`":[`"$AllowedOrigin`"],`"AllowMethods`":[`"POST`"],`"AllowHeaders`":[`"content-type`"],`"MaxAge`":3600}"
    aws lambda update-function-url-config `
        --function-name $FunctionName `
        --auth-type NONE `
        --cors $corsJson `
        --region $Region | Out-Null
}

try {
    aws lambda add-permission `
        --function-name $FunctionName `
        --statement-id "softball-lineup-function-url" `
        --action lambda:InvokeFunctionUrl `
        --principal "*" `
        --function-url-auth-type NONE `
        --region $Region | Out-Null
} catch {
    if ($_.Exception.Message -notmatch "ResourceConflictException") {
        throw
    }
}

Write-Host "Function URL: $functionUrl"
