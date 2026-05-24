param(
    [Parameter(Mandatory = $true)]
    [string]$FunctionName,

    [string]$Region = "us-east-1",

    [string]$ScheduleName = "",

    [string]$ScheduleExpression = "cron(15 10 * * ? *)"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceFile = Join-Path $projectRoot "aws\lambdas\sabres-line-optimizer\index.mjs"
$buildDir = Join-Path $projectRoot ".deploy"
$zipPath = Join-Path $buildDir "sabres-line-optimizer.zip"

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

aws lambda update-function-code `
    --function-name $FunctionName `
    --region $Region `
    --zip-file ("fileb://" + $zipPath)

Write-Host "Deployed $FunctionName from $sourceFile"

if (-not $ScheduleName) {
    return
}

$functionArn = aws lambda get-function `
    --function-name $FunctionName `
    --region $Region `
    --query "Configuration.FunctionArn" `
    --output text

aws events put-rule `
    --name $ScheduleName `
    --schedule-expression $ScheduleExpression `
    --state ENABLED `
    --region $Region | Out-Null

$ruleArn = aws events describe-rule `
    --name $ScheduleName `
    --region $Region `
    --query "Arn" `
    --output text

try {
    aws lambda add-permission `
        --function-name $FunctionName `
        --statement-id "$ScheduleName-invoke" `
        --action lambda:InvokeFunction `
        --principal events.amazonaws.com `
        --source-arn $ruleArn `
        --region $Region | Out-Null
} catch {
    if ($_.Exception.Message -notmatch "ResourceConflictException") {
        throw
    }
}

$targetsJson = "[{`"Id`":`"1`",`"Arn`":`"$functionArn`"}]"

aws events put-targets `
    --rule $ScheduleName `
    --targets $targetsJson `
    --region $Region | Out-Null

Write-Host "Scheduled $FunctionName with EventBridge rule $ScheduleName ($ScheduleExpression)"
