# S3 Static Website Hosting Deployment Script
# LabPulse Dashboard

param (
    [string]$BucketName = "wit-solapur-labpulse-dashboard-8937",
    [string]$Region = "ap-south-1"
)

$ErrorActionPreference = "Stop"

# Retrieve AWS CLI path
$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')

Write-Host "=== LabPulse Dashboard Deployer ===" -ForegroundColor Cyan
Write-Host "Walchand Institute of Technology, Solapur`n" -ForegroundColor Gray

Write-Host "Target S3 Bucket: $BucketName" -ForegroundColor Green
Write-Host "Target AWS Region: $Region`n" -ForegroundColor Green

# 2. Build the React dashboard
Write-Host "Building React Dashboard..." -ForegroundColor Yellow
$OriginalLocation = Get-Location
try {
    Set-Location "$PSScriptRoot\dashboard"
    npm run build
} finally {
    Set-Location $OriginalLocation
}

# 3. Create or verify S3 Bucket
Write-Host "`nVerifying S3 Bucket in $Region..." -ForegroundColor Yellow
$bucketExists = $false
try {
    aws s3api head-bucket --bucket $BucketName --region $Region 2>$null
    if ($LASTEXITCODE -eq 0) {
        $bucketExists = $true
        Write-Host "Bucket $BucketName already exists. Reusing existing bucket." -ForegroundColor Green
    }
} catch {
    $bucketExists = $false
}

if (-not $bucketExists) {
    Write-Host "Creating S3 Bucket $BucketName in $Region..." -ForegroundColor Yellow
    aws s3api create-bucket `
        --bucket $BucketName `
        --region $Region `
        --create-bucket-configuration LocationConstraint=$Region | Out-Null
}

# 4. Disable Public Access Block settings
Write-Host "Disabling S3 Public Access Blocks..." -ForegroundColor Yellow
$PubAccessJson = '{"BlockPublicAcls":false,"IgnorePublicAcls":false,"BlockPublicPolicy":false,"RestrictPublicBuckets":false}'
$PubAccessFile = "$PSScriptRoot\pub_access_temp.json"
$PubAccessJson | Out-File -FilePath $PubAccessFile -Encoding ascii
aws s3api put-public-access-block `
    --bucket $BucketName `
    --region $Region `
    --public-access-block-configuration "file://$PubAccessFile"
Remove-Item $PubAccessFile -Force -ErrorAction SilentlyContinue

# 5. Enable Static Website Hosting
Write-Host "Configuring S3 Static Website Hosting..." -ForegroundColor Yellow
$WebConfigJson = '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"index.html"}}'
$WebConfigFile = "$PSScriptRoot\web_config_temp.json"
$WebConfigJson | Out-File -FilePath $WebConfigFile -Encoding ascii
aws s3api put-bucket-website `
    --bucket $BucketName `
    --region $Region `
    --website-configuration "file://$WebConfigFile"
Remove-Item $WebConfigFile -Force -ErrorAction SilentlyContinue

# 6. Apply Public Read Bucket Policy
Write-Host "Applying Public Read policy..." -ForegroundColor Yellow
$Policy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BucketName/*"
    }
  ]
}
"@
$PolicyFile = "$PSScriptRoot\policy_temp.json"
$Policy | Out-File -FilePath $PolicyFile -Encoding ascii
aws s3api put-bucket-policy --bucket $BucketName --region $Region --policy "file://$PolicyFile"
Remove-Item $PolicyFile -Force -ErrorAction SilentlyContinue

# 7. Upload Built Files
Write-Host "Uploading dashboard files to S3..." -ForegroundColor Yellow
aws s3 sync "$PSScriptRoot\dashboard\dist" "s3://$BucketName" --region $Region --delete

$WebsiteUrl = "http://$BucketName.s3-website.$Region.amazonaws.com"
$S3ObjectUrl = "https://$BucketName.s3.$Region.amazonaws.com/index.html"

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "Dashboard Deployed Successfully!" -ForegroundColor Green
Write-Host "Primary S3 Website URL (Recommended):" -ForegroundColor Yellow
Write-Host "  $WebsiteUrl" -ForegroundColor Cyan
Write-Host "Direct S3 Object URL:" -ForegroundColor Yellow
Write-Host "  $S3ObjectUrl" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
