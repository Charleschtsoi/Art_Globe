# Push Art Globe skills showcase changes to GitHub
# Prerequisites: Git installed (https://git-scm.com/download/win)
# Run from repo root: .\scripts\push-to-github.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git is not installed. Install from https://git-scm.com/download/win then re-run this script." -ForegroundColor Red
  exit 1
}

$remote = "https://github.com/Charleschtsoi/Art_Globe.git"

if (-not (Test-Path .git)) {
  Write-Host "Initializing git and connecting to $remote ..."
  git init
  git remote add origin $remote
  git fetch origin main
  git checkout -B main origin/main
}

Write-Host "Staging changes ..."
git add -A
git status

$msg = @"
Add skills showcase: landing, about, explore routes

- Landing page (/) and portfolio case study (/about)
- Move globe to /explore with lazy search index load
- Extract useGlobeData, useMarkerFactory, globe UI components
- Onboarding coach, loading banner, Playwright smoke tests
- Unify demo URL to art-globe.vercel.app
"@

git commit -m $msg.Trim()

Write-Host "Pushing to origin main ..."
git push -u origin main

Write-Host "Done." -ForegroundColor Green
