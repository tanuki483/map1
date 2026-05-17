function Save-File($url, $dest) {
    $name = Split-Path $dest -Leaf
    if (Test-Path $dest) {
        Write-Host "  [SKIP] $name (already exists)" -ForegroundColor DarkGray
        return
    }
    Write-Host "  [GET]  $name ..." -NoNewline
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
        $size = [math]::Round((Get-Item $dest).Length / 1KB, 1)
        Write-Host " OK (${size} KB)" -ForegroundColor Green
    }
    catch {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "         URL: $url" -ForegroundColor Yellow
        Write-Host "         Error: $_" -ForegroundColor Yellow
    }
}

# =========================
# 1. PDF.js v3.11.174 (UMD)
# =========================
Write-Host "`n=== PDF.js ===" -ForegroundColor Cyan
Save-File "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" "$root\libs\pdfjs\pdf.min.js"
Save-File "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js" "$root\libs\pdfjs\pdf.worker.min.js"

# =========================
# 2. Tesseract.js v5
# =========================
Write-Host "`n=== Tesseract.js ===" -ForegroundColor Cyan
Save-File "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js" "$root\libs\tesseract\tesseract.min.js"
Save-File "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js" "$root\libs\tesseract\worker.min.js"

# Tesseract.js Core (WASM) v5.1.1
$coreBase = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1"
$coreFiles = @(
    "tesseract-core.wasm.js",
    "tesseract-core-simd.wasm.js",
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js"
)
foreach ($f in $coreFiles) {
    Save-File "$coreBase/$f" "$root\libs\tesseract\core\$f"
}

# =========================
# 3. Tessdata (言語データ)
# =========================
Write-Host "`n=== Tessdata (Language Data) ===" -ForegroundColor Cyan
Write-Host "  NOTE: jpn.traineddata.gz is ~15MB. This may take a moment." -ForegroundColor Yellow
Save-File "https://tessdata.projectnaptha.com/4.0.0_best/jpn.traineddata.gz" "$root\libs\tessdata\jpn.traineddata.gz"
Save-File "https://tessdata.projectnaptha.com/4.0.0_best/eng.traineddata.gz" "$root\libs\tessdata\eng.traineddata.gz"

# =========================
# 4. SheetJS (xlsx)
# =========================
Write-Host "`n=== SheetJS ===" -ForegroundColor Cyan
Save-File "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" "$root\libs\xlsx\xlsx.full.min.js"
