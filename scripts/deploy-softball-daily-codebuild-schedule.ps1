param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectName,

    [string]$Region = "us-east-1",

    [string]$ScheduleName = "softball-daily-update",

    [string]$ScheduleExpression = "cron(30 10 * * ? *)",

    [Parameter(Mandatory = $true)]
    [string]$EventRoleArn
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI is not installed or not on PATH."
}

$projectArn = aws codebuild batch-get-projects `
    --names $ProjectName `
    --region $Region `
    --query "projects[0].arn" `
    --output text

if (-not $projectArn -or $projectArn -eq "None") {
    throw "CodeBuild project not found: $ProjectName"
}

aws events put-rule `
    --name $ScheduleName `
    --schedule-expression $ScheduleExpression `
    --state ENABLED `
    --region $Region | Out-Null

$targets = @(
    @{
        Id = "1"
        Arn = $projectArn
        RoleArn = $EventRoleArn
    }
) | ConvertTo-Json -Compress

aws events put-targets `
    --rule $ScheduleName `
    --targets $targets `
    --region $Region | Out-Null

Write-Host "Scheduled CodeBuild project $ProjectName with EventBridge rule $ScheduleName ($ScheduleExpression)"
