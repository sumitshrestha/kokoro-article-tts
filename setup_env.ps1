<#
setup_env.ps1

Creates a Python virtual environment, installs requirements from `tts_service/requirements.txt`,
and downloads the ONNX model and an optional .bin vocoder file.

Usage:
  - Interactive (prompts for URLs):
      powershell -ExecutionPolicy Bypass -File .\setup_env.ps1

  - Non-interactive (provide URLs via env vars):
      $env:MODEL_URL = 'https://...' ; $env:VOCODER_URL = 'https://...' ; powershell -ExecutionPolicy Bypass -File .\setup_env.ps1

#>

$ErrorActionPreference = 'Stop'

function Prompt-Url($envName, $promptText) {
    if ($env:$envName -and -not [string]::IsNullOrWhiteSpace($env:$envName)) {
        return $env:$envName
    }
    return Read-Host $promptText
}

Write-Host "Starting environment setup..."

$ModelUrl = Prompt-Url -envName 'MODEL_URL' -promptText 'Enter model ONNX URL (leave empty to skip):'
$BinUrl   = Prompt-Url -envName 'VOCODER_URL' -promptText 'Enter vocoder .bin URL (leave empty to skip):'

$venvPath = Join-Path $PSScriptRoot '.venv'
if (-not (Test-Path $venvPath)) {
    Write-Host "Creating virtual environment at $venvPath"
    python -m venv $venvPath
} else {
    Write-Host "Virtual environment already exists at $venvPath"
}

$pip = Join-Path $venvPath 'Scripts\pip.exe'
if (-not (Test-Path $pip)) {
    Write-Error "pip not found at $pip. Ensure Python is installed and on PATH."
    exit 1
}

Write-Host "Upgrading pip..."
Start-Process -FilePath $pip -ArgumentList 'install','--upgrade','pip' -NoNewWindow -Wait

$reqFile = Join-Path $PSScriptRoot 'tts_service\requirements.txt'
if (Test-Path $reqFile) {
    Write-Host "Installing Python requirements from $reqFile"
    Start-Process -FilePath $pip -ArgumentList 'install','-r',$reqFile -NoNewWindow -Wait
} else {
    Write-Host "No requirements.txt found at $reqFile — skipping pip install"
}

$modelsDir = Join-Path $PSScriptRoot 'tts_service'
if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Path $modelsDir | Out-Null }

function Download-File($url, $outPath) {
    if ([string]::IsNullOrWhiteSpace($url)) {
        Write-Host "No URL provided — skipping download for $outPath"
        return
    }
    Write-Host "Downloading $url -> $outPath"
    try {
        Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing
        Write-Host "Saved: $outPath"
    } catch {
        Write-Error "Failed to download $url : $_"
    }
}

if (-not [string]::IsNullOrWhiteSpace($ModelUrl)) {
    $outOnnx = Join-Path $modelsDir 'kokoro-v1.0.onnx'
    Download-File -url $ModelUrl -outPath $outOnnx
}

if (-not [string]::IsNullOrWhiteSpace($BinUrl)) {
    $binName = [System.IO.Path]::GetFileName($BinUrl)
    if ([string]::IsNullOrWhiteSpace($binName)) { $binName = 'vocoder.bin' }
    $outBin = Join-Path $modelsDir $binName
    Download-File -url $BinUrl -outPath $outBin
}

Write-Host "Setup finished. To activate the virtual environment run:`n  & .\\.venv\\Scripts\\Activate.ps1`"
Write-Host "Then run the TTS service: `n  python .\\tts_service\\app.py`"
