/* ============================================================
   Bank Statement OCR → Excel  (Offline Tool)
   Main Application Logic
   ============================================================ */

// --- State ---
const S = {
  pdfDoc: null, pageCount: 0, pageCanvases: [], selectedPages: new Set(),
  ocrResults: [], parsedRows: [], processing: false, ocrWorker: null,
  scale: 2, contrast: 100, brightness: 100, threshold: 128,
  binarize: false, grayscale: true, startTime: 0
};

// --- DOM Refs ---
const $ = id => document.getElementById(id);
const dom = {};

document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM refs
  ['btn-theme','btn-load','btn-ocr','btn-export','btn-reset',
   'file-input','drop-zone','progress-fill','status-text',
   'tab-preview','tab-ocrtext','tab-table',
   'panel-preview','panel-ocrtext','panel-table',
   'page-grid','ocr-textarea','table-body',
   'slider-scale','slider-contrast','slider-brightness','slider-threshold',
   'val-scale','val-contrast','val-brightness','val-threshold',
   'chk-grayscale','chk-binarize',
   'info-pages','info-rows','info-time','toast'
  ].forEach(id => dom[id] = $(id));

  initEventListeners();
});

// --- Event Listeners ---
function initEventListeners() {
  // Theme toggle
  dom['btn-theme'].addEventListener('click', () => {
    document.body.classList.toggle('theme-warm');
    const w = document.body.classList.contains('theme-warm');
    dom['btn-theme'].textContent = w ? '❄ 寒色に切替' : '☀️ 暖色に切替';
    showToast(w ? '暖色テーマ' : '寒色テーマ');
  });

  // File input
  dom['btn-load'].addEventListener('click', () => dom['file-input'].click());
  dom['file-input'].addEventListener('change', e => {
    if (e.target.files[0]) loadPDF(e.target.files[0]);
  });

  // Drop zone
  const dz = dom['drop-zone'];
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.type === 'application/pdf') loadPDF(f);
      else showToast('PDFファイルのみ対応しています');
    });
    dz.addEventListener('click', () => dom['file-input'].click());
  }

  // Sliders
  setupSlider('slider-scale', 'val-scale', v => { S.scale = +v; });
  setupSlider('slider-contrast', 'val-contrast', v => { S.contrast = +v; });
  setupSlider('slider-brightness', 'val-brightness', v => { S.brightness = +v; });
  setupSlider('slider-threshold', 'val-threshold', v => { S.threshold = +v; });

  // Checkboxes
  dom['chk-grayscale'].addEventListener('change', e => S.grayscale = e.target.checked);
  dom['chk-binarize'].addEventListener('change', e => S.binarize = e.target.checked);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Actions
  dom['btn-ocr'].addEventListener('click', runOCR);
  dom['btn-export'].addEventListener('click', exportExcel);
  dom['btn-reset'].addEventListener('click', resetAll);
}

function setupSlider(sliderId, valId, cb) {
  const sl = dom[sliderId], vl = dom[valId];
  if (!sl) return;
  sl.addEventListener('input', () => { vl.textContent = sl.value; cb(sl.value); });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
}

// --- PDF Loading ---
async function loadPDF(file) {
  setStatus('PDF読み込み中...');
  setProgress(10);
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    S.pdfDoc = pdf;
    S.pageCount = pdf.numPages;
    S.selectedPages = new Set(Array.from({length: pdf.numPages}, (_, i) => i + 1));
    dom['info-pages'].textContent = `PAGES: ${pdf.numPages}`;
    setProgress(30);
    await renderAllPages();
    switchTab('preview');
    setStatus(`PDF読み込み完了 (${pdf.numPages}ページ)`);
    setProgress(100);
    showToast(`${pdf.numPages}ページのPDFを読み込みました`);
    dom['btn-ocr'].disabled = false;
  } catch (e) {
    console.error(e);
    setStatus('エラー: PDF読み込み失敗');
    showToast('PDFの読み込みに失敗しました');
  }
}

async function renderAllPages() {
  const grid = dom['page-grid'];
  grid.innerHTML = '';
  S.pageCanvases = [];

  for (let i = 1; i <= S.pageCount; i++) {
    setStatus(`ページ ${i}/${S.pageCount} レンダリング中...`);
    setProgress(30 + (i / S.pageCount) * 60);
    const page = await S.pdfDoc.getPage(i);
    const vp = page.getViewport({ scale: S.scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // Apply preprocessing
    applyPreprocessing(canvas);

    S.pageCanvases.push(canvas);

    // Create card
    const card = document.createElement('div');
    card.className = 'page-card selected';
    card.dataset.page = i;
    const display = document.createElement('canvas');
    display.width = canvas.width;
    display.height = canvas.height;
    display.getContext('2d').drawImage(canvas, 0, 0);
    const label = document.createElement('div');
    label.className = 'page-label';
    label.innerHTML = `<span>ページ ${i}</span><input type="checkbox" checked>`;
    const chk = label.querySelector('input');
    chk.addEventListener('change', () => {
      if (chk.checked) { S.selectedPages.add(i); card.classList.add('selected'); }
      else { S.selectedPages.delete(i); card.classList.remove('selected'); }
    });
    card.appendChild(display);
    card.appendChild(label);
    grid.appendChild(card);
  }
}

// --- Image Preprocessing ---
function applyPreprocessing(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];

    // Brightness
    if (S.brightness !== 100) {
      const f = S.brightness / 100;
      r *= f; g *= f; b *= f;
    }

    // Contrast
    if (S.contrast !== 100) {
      const f = (S.contrast / 100 - 1) * 255;
      r = truncate(((r - 128) * (1 + f / 255)) + 128);
      g = truncate(((g - 128) * (1 + f / 255)) + 128);
      b = truncate(((b - 128) * (1 + f / 255)) + 128);
    }

    // Grayscale
    if (S.grayscale) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray;
    }

    // Binarize
    if (S.binarize) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray > S.threshold ? 255 : 0;
    }

    d[i] = truncate(r); d[i+1] = truncate(g); d[i+2] = truncate(b);
  }
  ctx.putImageData(img, 0, 0);
}

function truncate(v) { return Math.max(0, Math.min(255, v)); }

// --- OCR ---
async function runOCR() {
  if (S.processing || !S.pdfDoc) return;
  S.processing = true;
  S.startTime = Date.now();
  dom['btn-ocr'].disabled = true;
  S.ocrResults = [];
  dom['ocr-textarea'].value = '';

  const pages = [...S.selectedPages].sort((a, b) => a - b);
  if (pages.length === 0) { showToast('ページを選択してください'); S.processing = false; dom['btn-ocr'].disabled = false; return; }

  setStatus('Tesseract.js 初期化中...');
  setProgress(5);

  try {
    const worker = await Tesseract.createWorker('jpn+eng', 1, {
      workerPath: 'libs/tesseract/worker.min.js',
      corePath: 'libs/tesseract/core/',
      langPath: 'libs/tessdata/',
      logger: m => {
        if (m.status === 'recognizing text') {
          const pageP = ((m.progress || 0) * 100).toFixed(0);
          setStatus(`OCR認識中... ${pageP}%`);
        }
      }
    });

    let allText = '';
    for (let idx = 0; idx < pages.length; idx++) {
      const pn = pages[idx];
      const overall = ((idx / pages.length) * 100).toFixed(0);
      setStatus(`ページ ${pn} OCR中... (全体 ${overall}%)`);
      setProgress(10 + (idx / pages.length) * 80);

      const canvas = S.pageCanvases[pn - 1];
      const { data: { text } } = await worker.recognize(canvas);
      S.ocrResults.push({ page: pn, text });
      allText += `--- ページ ${pn} ---\n${text}\n\n`;
      dom['ocr-textarea'].value = allText;
    }

    await worker.terminate();

    // Parse results
    S.parsedRows = parseOcrText(allText);
    renderTable();

    const elapsed = ((Date.now() - S.startTime) / 1000).toFixed(1);
    dom['info-rows'].textContent = `ROWS: ${S.parsedRows.length}`;
    dom['info-time'].textContent = `TIME: ${elapsed}s`;

    setProgress(100);
    setStatus(`OCR完了 (${elapsed}秒, ${S.parsedRows.length}行検出)`);
    showToast(`OCR完了: ${S.parsedRows.length}行のデータを検出`);
    switchTab('table');
    dom['btn-export'].disabled = false;
  } catch (e) {
    console.error(e);
    setStatus('エラー: OCR処理失敗');
    showToast('OCR処理に失敗しました: ' + e.message);
  } finally {
    S.processing = false;
    dom['btn-ocr'].disabled = false;
  }
}

// --- Text Parser ---
function parseOcrText(text) {
  const lines = text.split('\n');
  const rows = [];
  const dateRe = /(\d{1,4}[\/\.\-年]\s*\d{1,2}[\/\.\-月]\s*\d{1,2}日?)/;
  const amountRe = /[\d,]{2,}/g;

  for (const line of lines) {
    if (line.startsWith('---')) continue;
    const dm = line.match(dateRe);
    if (!dm) continue;

    const date = dm[1].replace(/\s/g, '').replace(/年/, '/').replace(/月/, '/').replace(/日/, '');
    const rest = line.substring(dm.index + dm[0].length);

    // Extract all numbers
    const amounts = [];
    let m;
    const re = /[\d,]{2,}/g;
    while ((m = re.exec(rest)) !== null) {
      const n = parseInt(m[0].replace(/,/g, ''), 10);
      if (n > 0) amounts.push({ val: n, idx: m.index });
    }

    // Extract description (text before first number)
    let desc = rest;
    if (amounts.length > 0) {
      desc = rest.substring(0, amounts[0].idx);
    }
    desc = desc.replace(/[\s　]+/g, ' ').trim();

    // Assign: if 3+ amounts => withdrawal, deposit, balance
    // if 2 amounts => one transaction + balance
    // if 1 amount => could be any
    let withdrawal = '', deposit = '', balance = '';
    if (amounts.length >= 3) {
      withdrawal = amounts[0].val || '';
      deposit = amounts[1].val || '';
      balance = amounts[2].val;
    } else if (amounts.length === 2) {
      // Guess: larger last number is balance
      if (amounts[1].val > amounts[0].val) {
        deposit = amounts[0].val;
        balance = amounts[1].val;
      } else {
        withdrawal = amounts[0].val;
        balance = amounts[1].val;
      }
    } else if (amounts.length === 1) {
      balance = amounts[0].val;
    }

    rows.push({ date, desc, withdrawal: withdrawal || '', deposit: deposit || '', balance: balance || '' });
  }
  return rows;
}

// --- Table Rendering ---
function renderTable() {
  const tb = dom['table-body'];
  tb.innerHTML = '';
  S.parsedRows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td contenteditable="true">${esc(row.date)}</td>
      <td contenteditable="true">${esc(row.desc)}</td>
      <td contenteditable="true">${fmtNum(row.withdrawal)}</td>
      <td contenteditable="true">${fmtNum(row.deposit)}</td>
      <td contenteditable="true">${fmtNum(row.balance)}</td>
      <td><button class="btn-del" title="削除">✕</button></td>`;
    tr.querySelector('.btn-del').addEventListener('click', () => {
      S.parsedRows.splice(i, 1);
      renderTable();
    });
    // Sync edits back to state
    const cells = tr.querySelectorAll('td[contenteditable]');
    cells[0].addEventListener('blur', () => row.date = cells[0].textContent.trim());
    cells[1].addEventListener('blur', () => row.desc = cells[1].textContent.trim());
    cells[2].addEventListener('blur', () => row.withdrawal = parseNum(cells[2].textContent));
    cells[3].addEventListener('blur', () => row.deposit = parseNum(cells[3].textContent));
    cells[4].addEventListener('blur', () => row.balance = parseNum(cells[4].textContent));
    tb.appendChild(tr);
  });
}

function addRow() {
  S.parsedRows.push({ date: '', desc: '', withdrawal: '', deposit: '', balance: '' });
  renderTable();
  showToast('行を追加しました');
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtNum(n) { return n ? Number(n).toLocaleString() : ''; }
function parseNum(s) { const n = parseInt(String(s).replace(/[,\s]/g, ''), 10); return isNaN(n) ? '' : n; }

// --- Excel Export ---
function exportExcel() {
  if (S.parsedRows.length === 0) { showToast('エクスポートするデータがありません'); return; }
  // Sync table edits
  syncTableEdits();

  const header = ['日付', '摘要', 'お支払金額', 'お預り金額', '残高'];
  const data = [header, ...S.parsedRows.map(r => [
    r.date, r.desc,
    r.withdrawal ? Number(r.withdrawal) : '',
    r.deposit ? Number(r.deposit) : '',
    r.balance ? Number(r.balance) : ''
  ])];

  const ws = XLSX.utils.aoa_to_sheet(data);
  // Column widths
  ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '取引明細');

  const now = new Date();
  const fname = `bank_statement_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.xlsx`;
  XLSX.writeFile(wb, fname);
  showToast(`${fname} をダウンロードしました`);
}

function syncTableEdits() {
  const rows = dom['table-body'].querySelectorAll('tr');
  rows.forEach((tr, i) => {
    if (i >= S.parsedRows.length) return;
    const cells = tr.querySelectorAll('td[contenteditable]');
    if (cells.length >= 5) {
      S.parsedRows[i].date = cells[0].textContent.trim();
      S.parsedRows[i].desc = cells[1].textContent.trim();
      S.parsedRows[i].withdrawal = parseNum(cells[2].textContent);
      S.parsedRows[i].deposit = parseNum(cells[3].textContent);
      S.parsedRows[i].balance = parseNum(cells[4].textContent);
    }
  });
}

// --- Reset ---
function resetAll() {
  S.pdfDoc = null; S.pageCount = 0; S.pageCanvases = [];
  S.selectedPages = new Set(); S.ocrResults = []; S.parsedRows = [];
  dom['page-grid'].innerHTML = '';
  dom['ocr-textarea'].value = '';
  dom['table-body'].innerHTML = '';
  dom['info-pages'].textContent = 'PAGES: 0';
  dom['info-rows'].textContent = 'ROWS: 0';
  dom['info-time'].textContent = 'TIME: --';
  dom['btn-ocr'].disabled = true;
  dom['btn-export'].disabled = true;
  setProgress(0); setStatus('待機中');
  switchTab('preview');
  showToast('リセットしました');
}

// --- UI Helpers ---
function setProgress(pct) { dom['progress-fill'].style.width = pct + '%'; }
function setStatus(msg) { dom['status-text'].textContent = msg; }
function showToast(msg) {
  dom['toast'].textContent = msg;
  dom['toast'].classList.add('show');
  setTimeout(() => dom['toast'].classList.remove('show'), 3000);
}

// Expose addRow globally for button onclick
window.addRow = addRow;
