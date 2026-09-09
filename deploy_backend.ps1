# LabPulse Backend Deploy Script
# Runs sam build + sam deploy with the correct parameters.
# Usage:
#   .\deploy_backend.ps1 -Secret "your-session-token-secret"
#
# Requirements: AWS CLI, AWS SAM CLI, Python 3.12 installed and in PATH.

param (
    [Parameter(Mandatory = $true)]
    [string]$Secret
)

$ErrorActionPreference = "Stop"
$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')

Write-Host "=== LabPulse Backend Deployer ===" -ForegroundColor Cyan
Write-Host "Walchand Institute of Technology, Solapur`n" -ForegroundColor Gray

# Change into the backend directory
$OriginalLocation = Get-Location
try {
    Set-Location "$PSScriptRoot\backend"

    # Build
    Write-Host "Building Lambda functions with SAM..." -ForegroundColor Yellow
    sam build --use-container

    # Deploy using samconfig.toml + secret override
    Write-Host "`nDeploying stack to AWS..." -ForegroundColor Yellow
    sam deploy `
        --parameter-overrides `
            "TablePrefix=labpulse" `
            "AllowedOrigin=*" `
            "SessionTokenSecret=$Secret"

    Write-Host "`n=== Backend Deployed Successfully ===" -ForegroundColor Green
    Write-Host "Stack name : labpulse" -ForegroundColor Cyan
    Write-Host "Region     : ap-south-1" -ForegroundColor Cyan
    Write-Host "`nOutputs from the stack:" -ForegroundColor Yellow
    aws cloudformation describe-stacks `
        --stack-name labpulse `
        --region ap-south-1 `
        --query "Stacks[0].Outputs" `
        --output table

} finally {
    Set-Location $OriginalLocation
}
