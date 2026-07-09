<#
apply_rename_and_add_installer.ps1

Run from the repository root. This will:
- create branch chore/rename-hyphens-to-underscores
- move hyphenated node folders to underscore names
- remove shim directories that were previously created (they will be replaced by the real node folders)
- add install.bat
- commit & push the branch

Make sure your working tree is clean before running (git status --porcelain should be empty).
#>

param(
  [string]$BranchName = "chore/rename-hyphens-to-underscores",
  [string]$Remote = "origin"
)

Write-Host "Running in: $(Get-Location)"

if (-not (Test-Path .git)) {
  Write-Error "This does not appear to be a git repository root (no .git). Aborting."
  exit 1
}

# Ensure clean working tree
$st = git status --porcelain
if ($st.Trim() -ne "") {
  Write-Error "Working tree not clean — please commit or stash changes and re-run. Output:"
  git status --porcelain
  exit 1
}

# Create branch
git checkout -b $BranchName

# Helper: safe move function
function SafeMove($from, $to) {
  $fromPath = Join-Path "nodes" $from
  $toPath   = Join-Path "nodes" $to

  if (-not (Test-Path $fromPath)) {
    Write-Host "Source not found, skipping: $fromPath"
    return
  }

  # If target exists and is a shim (we created earlier), move it out of the way
  if (Test-Path $toPath) {
    Write-Host "Target path already exists: $toPath"
    # If the target looks like a shim (contains our shim header), back it up and then replace
    $shimMarker = Get-Content -Path (Join-Path $toPath "__init__.py") -ErrorAction SilentlyContinue
    if ($null -ne $shimMarker) {
      Write-Host "Backing up existing target (likely shim) to ${toPath}_backup_$(Get-Date -Format yyyyMMddHHmmss)"
      Rename-Item -Path $toPath -NewName ("${to}_backup_$(Get-Date -Format yyyyMMddHHmmss)")
    } else {
      Write-Error "Target exists and is not a recognized shim; aborting to avoid data loss: $toPath"
      exit 1
    }
  }

  Write-Host "Moving nodes\$from -> nodes\$to"
  Move-Item -Path $fromPath -Destination $toPath
}

# Mappings
$mappings = @{
  "comfyjbb-load-process-batch" = "comfyjbb_load_process_batch"
  "comfyui-loadheicimagefrompath" = "comfyui_loadheicimagefrompath"
  "comfyui-loadimagefrompath" = "comfyui_loadimagefrompath"
  "comfyui-raw-image-frompath" = "comfyui_raw_image_frompath"
}

foreach ($k in $mappings.Keys) {
  SafeMove $k $mappings[$k]
}

# Add install.bat (Windows batch installer)
$installBat = @'
@echo off
REM install.bat - copy nodes to ComfyUI custom_nodes and optionally install requirements
REM Usage: install.bat [destination_custom_nodes_dir] [python_exe]
SETLOCAL

SET REPO_DIR=%~dp0
SET DEST=%1
IF "%DEST%"=="" (
  SET DEST=%USERPROFILE%\ComfyUI\custom_nodes\comfyui-custom-nodes-jbb
)

SET PYEXE=%2
IF "%PYEXE%"=="" (
  SET PYEXE=python
)

echo Copying nodes to "%DEST%"
mkdir "%DEST%" 2>NUL
xcopy "%REPO_DIR%\nodes\*" "%DEST%\" /E /I /Y >nul

IF EXIST "%REPO_DIR%\nodes\comfyjbb-load-process-batch\requirements.txt" (
  echo Installing optional requirements for batch node...
  "%PYEXE%" -m pip install --upgrade pip
  "%PYEXE%" -m pip install -r "%REPO_DIR%\nodes\comfyjbb-load-process-batch\requirements.txt"
)

echo Done. Restart ComfyUI to load new custom nodes.
ENDLOCAL
'@

Set-Content -Path .\install.bat -Value $installBat -Encoding ascii

# Stage all renames/changes and new installer
git add -A

git commit -m "Rename hyphenated node folders to underscore names; add install.bat"

# Push the new branch
git push -u $Remote $BranchName

Write-Host "Done. Branch pushed: $Remote/$BranchName"
Write-Host "Open a PR from this branch to main (see gh cli or GitHub web)."