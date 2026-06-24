# publish.ps1
# Helper script to push this project to GitHub.
# Run this script in your PowerShell window, or follow the steps below manually.

Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "🚀 GitHub Publishing Assistant for Adira Telecom" -ForegroundColor Cyan
Write-Host "--------------------------------------------------`n"

$gitInstalled = $false
try {
    $version = git --version
    Write-Host "✅ Detected Git installation: $version" -ForegroundColor Green
    $gitInstalled = $true
} catch {
    Write-Host "⚠️ Git is not found in your system PATH." -ForegroundColor Yellow
    Write-Host "Please make sure Git is installed on your machine (download at https://git-scm.com/)." -ForegroundColor Gray
}

Write-Host "`n📁 Step 1: Create a new repository on GitHub" -ForegroundColor White
Write-Host "Go to https://github.com/new and create a new repository." -ForegroundColor Gray
Write-Host "Name it something like 'adira-telecom-portal' and leave it empty (do NOT check Add a README)." -ForegroundColor Gray

Write-Host "`n💻 Step 2: Open a terminal inside this folder and run these commands:" -ForegroundColor White
Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
Write-Host "git init" -ForegroundColor Green
Write-Host "git add ." -ForegroundColor Green
Write-Host "git commit -m `"Initial migration to Vercel and Firebase`"" -ForegroundColor Green
Write-Host "git branch -M main" -ForegroundColor Green
Write-Host "git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git" -ForegroundColor Green
Write-Host "git push -u origin main" -ForegroundColor Green
Write-Host "--------------------------------------------------" -ForegroundColor DarkGray

Write-Host "`n🌐 Step 3: Connect to Vercel" -ForegroundColor White
Write-Host "1. Go to https://vercel.com/new and import your new GitHub repository." -ForegroundColor Gray
Write-Host "2. Vercel will automatically detect the vercel.json configuration and publish your web app!" -ForegroundColor Gray
Write-Host "3. You will get a permanent public HTTPS URL ending with '.vercel.app'!" -ForegroundColor Gray

if ($gitInstalled) {
    $choice = Read-Host "`nWould you like this script to run the initial local git setup (init, add, commit) for you? (y/n)"
    if ($choice -eq 'y') {
        git init
        git add .
        git commit -m "Initial migration to Vercel and Firebase"
        git branch -M main
        Write-Host "`n✅ Local git repository initialized and committed successfully!" -ForegroundColor Green
        Write-Host "Next, create your GitHub repository, add the remote origin, and push using:" -ForegroundColor Yellow
        Write-Host "  git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git" -ForegroundColor Gray
        Write-Host "  git push -u origin main" -ForegroundColor Gray
    }
}
