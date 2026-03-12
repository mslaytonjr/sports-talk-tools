param(
    [Parameter(Mandatory = $true)]
    [string]$FunctionName,

    [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceFile = Join-Path $projectRoot "aws\lambdas\sabres-magic-number\index.mjs"
$buildDir = Join-Path $projectRoot ".deploy"
$zipPath = Join-Path $buildDir "sabres-magic-number.zip"

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
