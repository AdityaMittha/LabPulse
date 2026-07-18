# AWS S3 Static Website Hosting Deployment Script
# Walchand Institute of Technology, Solapur — LabPulse Dashboard

$ErrorActionPreference = "Stop"

# Retrieve AWS CLI path
$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')

Write-Host "=== LabPulse Dashboard Deployer ===" -ForegroundColor Cyan
Write-Host "Walchand Institute of Technology, Solapur`n" -ForegroundColor Gray

# 1. Generate unique bucket name
$RandomSuffix = Get-Random -Minimum 1000 -Maximum 9999
$BucketName = "wit-solapur-labpulse-dashboard-$RandomSuffix"
$Region = "ap-south-1"

Write-Host "Target S3 Bucket: $BucketName" -ForegroundColor Green
Write-Host "Target AWS Region: $Region`n" -ForegroundColor Green

# 2. Build the React dashboard
Write-Host "Building React Dashboard..." -ForegroundColor Yellow
cd dashboard
npm run build
cd ..

# 3. Create the S3 Bucket
Write-Host "`nCreating S3 Bucket in $Region..." -ForegroundColor Yellow
aws s3api create-bucket `
    --bucket $BucketName `
    --region $Region `
    --create-bucket-configuration LocationConstraint=$Region | Out-Null

# 4. Disable Public Access Block settings
Write-Host "Disabling S3 Public Access Blocks..." -ForegroundColor Yellow
$PubAccessJson = '{"BlockPublicAcls":false,"IgnorePublicAcls":false,"BlockPublicPolicy":false,"RestrictPublicBuckets":false}'
$PubAccessFile = ".\pub_access_temp.json"
$PubAccessJson | Out-File -FilePath $PubAccessFile -Encoding ascii
aws s3api put-public-access-block `
    --bucket $BucketName `
    --region $Region `
    --public-access-block-configuration "file://$PubAccessFile"
Remove-Item $PubAccessFile -Force

# 5. Enable Static Website Hosting
Write-Host "Configuring S3 Static Website Hosting..." -ForegroundColor Yellow
$WebConfigJson = '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"index.html"}}'
$WebConfigFile = ".\web_config_temp.json"
$WebConfigJson | Out-File -FilePath $WebConfigFile -Encoding ascii
aws s3api put-bucket-website `
    --bucket $BucketName `
    --region $Region `
    --website-configuration "file://$WebConfigFile"
Remove-Item $WebConfigFile -Force

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
$PolicyFile = ".\policy_temp.json"
$Policy | Out-File -FilePath $PolicyFile -Encoding ascii
aws s3api put-bucket-policy --bucket $BucketName --region $Region --policy "file://$PolicyFile"
Remove-Item $PolicyFile -Force

# 7. Upload Built Files
Write-Host "Uploading dashboard files to S3..." -ForegroundColor Yellow
aws s3 sync dashboard/dist "s3://$BucketName" --region $Region --delete

$WebsiteUrl = "http://$BucketName.s3-website.$Region.amazonaws.com"
Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "🎉 Dashboard Deployed Successfully!" -ForegroundColor Green
Write-Host "Live Website URL:" -ForegroundColor Yellow
Write-Host "👉 $WebsiteUrl" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
