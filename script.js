const REPO_OWNER = 'ifanjulianpratama';
const REPO_NAME = 'portal_tugas_unper';
const BRANCH = 'main';
const METADATA_PATH = 'tasks.json';

const DB_NAME = 'IfanSinglePortalDB';
const STORE_NAME = 'all_tasks';
let localDB = null;
let currentFilter = 'Semua';
let cachedTasks = [];
let isDeletingRepo = false;

function openLocalDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => {
      localDB = e.target.result;
      resolve(localDB);
    };
    req.onerror = () => resolve(null);
  });
}

function getLocalTasks() {
  return new Promise(async (resolve) => {
    const db = localDB || (await openLocalDB());
    if (!db) return resolve([]);
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function saveLocalTask(entry) {
  return new Promise(async (resolve) => {
    const db = localDB || (await openLocalDB());
    if (!db) return resolve();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(entry);
    tx.oncomplete = () => resolve();
  });
}

function deleteLocalTask(id) {
  return new Promise(async (resolve) => {
    const db = localDB || (await openLocalDB());
    if (!db) return resolve();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      loadAllTasks();
      resolve();
    };
  });
}

function toggleMobileMenu() {
  document.getElementById('mobile-menu').classList.toggle('hidden');
}

function closeMobileMenu() {
  document.getElementById('mobile-menu').classList.add('hidden');
}

function getToken() {
  return localStorage.getItem('ifan_gh_token') || '';
}

function updateTokenUI() {
  const status = document.getElementById('token-status');
  const badge = document.getElementById('badge-mode');
  if (getToken()) {
    if (status) status.textContent = '● Sinkronisasi Publik Aktif (Excel & Word langsung terbuka asli di jendela Microsoft Office).';
    if (badge) badge.textContent = '● Sinkron Publik Aktif';
  } else {
    if (status) status.textContent = '⚠ Set Token GitHub agar Excel & Word otomatis terbuka asli di Microsoft Office.';
    if (badge) badge.textContent = 'Wadah Terpadu Semua Tugas';
  }
}

function toggleTokenModal() {
  const box = document.getElementById('token-box');
  box.classList.toggle('hidden');
  document.getElementById('github-token-input').value = getToken();
  updateTokenUI();
}

function saveGithubToken() {
  const val = document.getElementById('github-token-input').value.trim();
  if (!val) return alert('Masukkan token GitHub terlebih dahulu!');
  localStorage.setItem('ifan_gh_token', val);
  updateTokenUI();
  loadAllTasks();
  alert('Token tersimpan!');
}

function clearGithubToken() {
  localStorage.removeItem('ifan_gh_token');
  document.getElementById('github-token-input').value = '';
  updateTokenUI();
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fetchTasksFromRepo() {
  const token = getToken();
  try {
    if (token) {
      const apiRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${METADATA_PATH}?ref=${BRANCH}&t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store'
      });
      if (apiRes.ok) {
        const data = await apiRes.json();
        return JSON.parse(base64ToUtf8(data.content));
      }
    }
    const rawRes = await fetch(`https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${METADATA_PATH}?t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (rawRes.ok) return await rawRes.json();
  } catch (err) {}
  return [];
}

async function deleteRepoTask(repoIndex) {
  const token = getToken();
  if (!token) return alert('Set Token GitHub dulu untuk menghapus tugas publik.');
  if (isDeletingRepo) return;

  isDeletingRepo = true;
  const statusEl = document.getElementById('status-upload');
  if (statusEl) statusEl.textContent = 'Menghapus tugas...';

  // Langsung hilangkan kartu dari layar seketika (Optimistic UI)
  const targetIndex = cachedTasks.findIndex((t) => t._repoIndex === repoIndex);
  if (targetIndex !== -1) {
    cachedTasks.splice(targetIndex, 1);
    renderDashboard();
  }

  try {
    const metaCheck = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${METADATA_PATH}?ref=${BRANCH}&t=${Date.now()}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!metaCheck.ok) throw new Error('Gagal membaca daftar tugas.');

    const metaData = await metaCheck.json();
    const list = JSON.parse(base64ToUtf8(metaData.content));
    list.splice(repoIndex, 1);

    const putRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${METADATA_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Hapus item tugas dari daftar',
        content: utf8ToBase64(JSON.stringify(list, null, 2)),
        sha: metaData.sha,
        branch: BRANCH
      })
    });

    if (!putRes.ok) throw new Error('Gagal sinkronisasi penghapusan ke GitHub.');
    if (statusEl) statusEl.textContent = 'Tugas berhasil dihapus.';
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Gagal menghapus: ' + err.message;
  } finally {
    isDeletingRepo = false;
    await loadAllTasks();
  }
}

function isImageFile(fileName) {
  return /\.(jpg|jpeg|png|webp|gif|svg|bmp)$/i.test(fileName);
}

function isVideoFile(fileName) {
  return /\.(mp4|webm|ogg|mov|mkv)$/i.test(fileName);
}

function isAudioFile(fileName) {
  return /\.(mp3|wav|m4a|aac|flac)$/i.test(fileName);
}

function isOfficeFile(fileName) {
  return /\.(xlsx|xls|doc|docx|ppt|pptx)$/i.test(fileName);
}

function isPdfFile(fileName) {
  return /\.pdf$/i.test(fileName);
}

function isCodeOrTextFile(fileName) {
  return /\.(txt|md|html|css|js|json|py|sql|php|java|c|cpp|csv)$/i.test(fileName);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function openPreview(index) {
  const item = cachedTasks[index];
  if (!item) return;

  const url = item.fileBlob ? URL.createObjectURL(item.fileBlob) : item.downloadUrl;
  const modal = document.getElementById('preview-modal');
  const body = document.getElementById('preview-body');
  document.getElementById('preview-title').textContent = `${item.urutan} — ${item.judul}`;
  document.getElementById('preview-subtitle').textContent = item.fileName;

  const dlBtn = document.getElementById('preview-download');
  dlBtn.href = url;
  dlBtn.download = item.fileName;

  const newTabBtn = document.getElementById('preview-newtab');
  newTabBtn.href = url;

  document.body.style.overflow = 'hidden';
  modal.classList.remove('hidden');
  body.innerHTML = `<div class="w-full h-full flex items-center justify-center"><p class="text-sm text-slate-300 animate-pulse">Membuka dokumen...</p></div>`;

  try {
    // 1. FOTO / GAMBAR -> LANGSUNG TERBUKA PENUH
    if (isImageFile(item.fileName)) {
      body.innerHTML = `
        <div class="w-full h-full flex items-center justify-center p-2 sm:p-6 bg-black">
          <img src="${url}" alt="${item.judul}" class="max-w-full max-h-full object-contain" />
        </div>
      `;

    // 2. VIDEO -> LANGSUNG DIPUTAR PENUH
    } else if (isVideoFile(item.fileName)) {
      body.innerHTML = `
        <div class="w-full h-full flex items-center justify-center bg-black">
          <video src="${url}" controls autoplay playsinline class="w-full h-full max-w-full max-h-full object-contain"></video>
        </div>
      `;

    // 3. AUDIO -> PEMUTAR AUDIO
    } else if (isAudioFile(item.fileName)) {
      body.innerHTML = `
        <div class="w-full h-full flex flex-col items-center justify-center p-8 space-y-4">
          <p class="text-base font-bold text-white">${item.fileName}</p>
          <audio src="${url}" controls autoplay class="w-80 sm:w-96"></audio>
        </div>
      `;

    // 4. PDF -> LANGSUNG PDF VIEWER PENUH
    } else if (isPdfFile(item.fileName)) {
      if (item.fileBlob) {
        body.innerHTML = `<iframe src="${url}#navpanes=0&view=FitH" class="w-full h-full border-0 bg-white"></iframe>`;
      } else {
        const res = await fetch(item.downloadUrl);
        const blob = await res.blob();
        const pdfBlobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        newTabBtn.href = pdfBlobUrl;
        body.innerHTML = `<iframe src="${pdfBlobUrl}#navpanes=0&view=FitH" class="w-full h-full border-0 bg-white"></iframe>`;
      }

    // 5. EXCEL, WORD, PPT -> LANGSUNG JENDELA ASLI MICROSOFT EXCEL / MICROSOFT WORD
    } else if (isOfficeFile(item.fileName)) {
      if (item.downloadUrl) {
        const officeViewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(item.downloadUrl)}`;
        newTabBtn.href = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(item.downloadUrl)}`;
        body.innerHTML = `<iframe src="${officeViewer}" class="w-full h-full border-0 bg-white"></iframe>`;
      } else {
        body.innerHTML = `
          <div class="w-full h-full flex flex-col items-center justify-center text-center space-y-4 p-6 max-w-md mx-auto">
            <p class="text-base font-extrabold text-[#edbb00]">File Ini Masih Lokal</p>
            <p class="text-xs text-slate-200 leading-relaxed">
              Hapus file lokal ini lalu unggah ulang saat <strong>● Sinkron Publik Aktif</strong> agar langsung terbuka di jendela asli Microsoft Excel / Word.
            </p>
          </div>
        `;
      }

    // 6. KODE / TEKS
    } else if (isCodeOrTextFile(item.fileName)) {
      const buffer = item.fileBlob ? await item.fileBlob.arrayBuffer() : await (await fetch(item.downloadUrl)).arrayBuffer();
      const rawText = new TextDecoder('utf-8').decode(buffer);
      body.innerHTML = `
        <div class="w-full h-full overflow-auto bg-[#0d1117] text-slate-100 p-4 sm:p-8">
          <pre class="text-xs sm:text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">${escapeHtml(rawText)}</pre>
        </div>
      `;

    } else {
      body.innerHTML = `
        <div class="w-full h-full flex flex-col items-center justify-center text-center space-y-4 p-6">
          <p class="text-base font-bold text-white">File: ${item.fileName}</p>
          <a href="${url}" download="${item.fileName}" class="barca-accent-btn px-5 py-2.5 rounded-xl text-xs font-bold text-white">Unduh File</a>
        </div>
      `;
    }
  } catch (err) {
    body.innerHTML = `<div class="w-full h-full flex items-center justify-center"><p class="text-sm text-rose-400 p-6">Gagal memuat file: ${err.message}</p></div>`;
  }
}

function closePreview() {
  document.getElementById('preview-modal').classList.add('hidden');
  document.getElementById('preview-body').innerHTML = '';
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePreview();
});

function setFilter(filterName) {
  currentFilter = filterName;
  renderDashboard();
}

function renderDashboard() {
  const filterBar = document.getElementById('filter-bar');
  const container = document.getElementById('daftar-tugas');
  const countEl = document.getElementById('jumlah-tugas');

  const categories = ['Semua', ...new Set(cachedTasks.map((t) => t.urutan || 'Tugas'))];
  filterBar.innerHTML = categories
    .map((cat) => {
      const activeClass = cat === currentFilter ? 'filter-active' : 'bg-black/40 text-slate-200 border-white/15 hover:bg-white/10';
      return `<button type="button" onclick="setFilter('${cat.replace(/'/g, "\\'")}')" class="${activeClass} px-3 py-1 rounded-lg text-xs font-bold border transition">${cat}</button>`;
    })
    .join('');

  const filtered = currentFilter === 'Semua'
    ? cachedTasks
    : cachedTasks.filter((t) => (t.urutan || 'Tugas') === currentFilter);

  countEl.textContent = filtered.length;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="col-span-full barca-subcard rounded-2xl p-6 text-center space-y-1">
        <p class="text-sm font-bold text-white">Belum ada tugas yang dikumpulkan.</p>
        <p class="text-xs text-slate-300">Gunakan form di atas untuk mengirim file, foto, atau video tugas kamu.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach((item) => {
    const realIndex = cachedTasks.indexOf(item);
    const ext = item.fileName.split('.').pop().toUpperCase();
    const url = item.fileBlob ? URL.createObjectURL(item.fileBlob) : item.downloadUrl;
    const isImg = isImageFile(item.fileName);
    const isVid = isVideoFile(item.fileName);

    const badgeStyle = ext.includes('XLS') ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                     : ext.includes('DOC') ? 'bg-sky-500/20 text-sky-300 border-sky-400/40'
                     : ext === 'PDF' ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                     : isVid ? 'bg-purple-500/20 text-purple-300 border-purple-400/40'
                     : 'bg-[#edbb00]/20 text-[#edbb00] border-[#edbb00]/40';

    const openLabel = ext.includes('XLS') ? 'Buka di Excel'
                    : ext.includes('DOC') ? 'Buka di Word'
                    : ext === 'PDF' ? 'Buka PDF'
                    : isImg ? 'Lihat Foto Penuh'
                    : isVid ? 'Putar Video Penuh'
                    : 'Buka File';

    let mediaPreviewHtml = '';
    if (isImg) {
      mediaPreviewHtml = `
        <div onclick="openPreview(${realIndex})" class="cursor-pointer overflow-hidden rounded-xl border border-white/15 bg-black/40">
          <img src="${url}" alt="${item.judul}" class="w-full h-48 object-cover hover:scale-105 transition duration-300" />
        </div>`;
    } else if (isVid) {
      mediaPreviewHtml = `
        <div class="overflow-hidden rounded-xl border border-white/15 bg-black">
          <video src="${url}" controls preload="metadata" class="w-full h-48 object-cover"></video>
        </div>`;
    }

    const deleteBtn = item.id
      ? `<button type="button" onclick="deleteLocalTask(${item.id})" class="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-rose-600 text-xs font-bold text-white" title="Hapus">✕</button>`
      : (getToken() && typeof item._repoIndex === 'number'
          ? `<button type="button" onclick="deleteRepoTask(${item._repoIndex})" class="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-rose-600 text-xs font-bold text-white" title="Hapus">✕</button>`
          : '');

    const card = document.createElement('div');
    card.className = 'barca-subcard rounded-2xl p-4 flex flex-col justify-between gap-3.5';
    card.innerHTML = `
      <div class="space-y-3">
        <div onclick="openPreview(${realIndex})" class="cursor-pointer flex items-start justify-between gap-2 group">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl ${badgeStyle} border flex items-center justify-center font-extrabold text-xs shrink-0">
              ${ext}
            </div>
            <div class="min-w-0">
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold rounded bg-[#edbb00]/20 text-[#edbb00] mb-0.5">
                ${item.urutan || 'Tugas'}
              </span>
              <p class="text-sm font-bold text-white group-hover:text-[#edbb00] transition truncate">${item.judul}</p>
            </div>
          </div>
        </div>

        ${mediaPreviewHtml}

        <div class="text-xs text-slate-300 space-y-0.5">
          <p class="truncate text-slate-200 font-medium">${item.fileName}</p>
          ${item.catatan ? `<p class="text-[11px] text-slate-400">${item.catatan}</p>` : ''}
          <p class="text-[11px] text-slate-400">Dikumpulkan: ${item.tanggal}</p>
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <button type="button" onclick="openPreview(${realIndex})" class="flex-1 barca-accent-btn px-3.5 py-2 rounded-xl text-xs font-bold text-white text-center transition">
          ${openLabel}
        </button>
        <a href="${url}" download="${item.fileName}" class="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/15 transition">
          Unduh
        </a>
        ${deleteBtn}
      </div>
    `;
    container.appendChild(card);
  });
}

async function loadAllTasks() {
  const [repoTasks, localTasks] = await Promise.all([fetchTasksFromRepo(), getLocalTasks()]);
  const taggedRepo = repoTasks.map((t, idx) => ({ ...t, _repoIndex: idx }));
  cachedTasks = [...localTasks.reverse(), ...taggedRepo];
  renderDashboard();
}

async function uploadToGithub(file, meta) {
  const token = getToken();
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = `uploads/${safeName}`;
  const base64Content = await fileToBase64(file);

  const fileRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `Upload ${meta.urutan}: ${meta.judul}`,
      content: base64Content,
      branch: BRANCH
    })
  });

  if (!fileRes.ok) {
    const err = await fileRes.json();
    throw new Error(err.message || 'Gagal mengunggah file ke GitHub.');
  }

  let existingTasks = [];
  let sha = null;
  const metaCheck = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${METADATA_PATH}?ref=${BRANCH}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (metaCheck.ok) {
    const metaData = await metaCheck.json();
    sha = metaData.sha;
    existingTasks = JSON.parse(base64ToUtf8(metaData.content));
  }

  existingTasks.unshift({
    urutan: meta.urutan,
    judul: meta.judul,
    catatan: meta.catatan,
    fileName: file.name,
    tanggal: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
    downloadUrl: `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`
  });

  const updateBody = {
    message: `Update daftar tugas: ${meta.urutan} - ${meta.judul}`,
    content: utf8ToBase64(JSON.stringify(existingTasks, null, 2)),
    branch: BRANCH
  };
  if (sha) updateBody.sha = sha;

  const metaSave = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${METADATA_PATH}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateBody)
  });

  if (!metaSave.ok) throw new Error('Gagal memperbarui daftar tugas.');
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-semua-tugas');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const urutan = document.getElementById('input-urutan').value.trim() || 'Tugas';
      const judul = document.getElementById('input-judul').value.trim();
      const catatan = document.getElementById('input-catatan').value.trim();
      const fileInput = document.getElementById('input-file');
      const statusEl = document.getElementById('status-upload');
      const btnEl = document.getElementById('btn-submit');

      if (!fileInput.files.length) return;
      const file = fileInput.files[0];
      const tanggal = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

      try {
        btnEl.disabled = true;
        btnEl.textContent = 'Mengirim...';

        if (getToken()) {
          statusEl.textContent = 'Mengunggah ke GitHub agar langsung tampil di bawah...';
          await uploadToGithub(file, { urutan, judul, catatan });
          statusEl.textContent = 'Berhasil! File sudah tampil di bawah.';
        } else {
          await saveLocalTask({ urutan, judul, catatan, fileName: file.name, fileBlob: file, tanggal });
          statusEl.textContent = 'Tersimpan lokal di bawah!';
        }

        form.reset();
        currentFilter = 'Semua';
        await loadAllTasks();
      } catch (err) {
        statusEl.textContent = 'Gagal: ' + err.message;
        alert('Gagal mengirim tugas: ' + err.message);
      } finally {
        btnEl.disabled = false;
        btnEl.textContent = 'Kirim & Tampilkan Tugas';
      }
    });
  }

  updateTokenUI();
  loadAllTasks();
});