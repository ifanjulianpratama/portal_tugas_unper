// URL Web App Google Apps Script (Sudah Terhubung)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxiK7-RzZ5XgazdAODwKA_Zc96E_TVSttSgNv7OAhZkUkzYkyDveoBqhCFUji_3jk0q/exec";

const form = document.getElementById('form-tugas');
const fileInput = document.getElementById('file_tugas');
const dropZone = document.getElementById('drop-zone');
const fileLabelTitle = document.getElementById('file-label-title');
const fileLabelSub = document.getElementById('file-label-sub');
const btnSubmit = document.getElementById('btn-submit');
const btnText = document.getElementById('btn-text');
const alertBox = document.getElementById('alert-box');

let alertTimer; // Penampung timer notifikasi

// Menampilkan notifikasi sukses atau gagal (otomatis hilang setelah 4 detik)
function showAlert(type, message) {
    clearTimeout(alertTimer); // Reset timer jika ada notifikasi baru sebelum yang lama hilang

    alertBox.style.opacity = '1';
    alertBox.style.transition = 'opacity 0.5s ease';
    alertBox.className = 'mb-5 p-4 rounded-xl text-xs sm:text-sm border backdrop-blur-md animate-pop flex items-start gap-3';

    if (type === 'sukses') {
        alertBox.classList.add('bg-emerald-950/85', 'border-emerald-400/50', 'text-emerald-200');
        alertBox.innerHTML = `<span class="text-base">✅</span><div><strong class="text-emerald-300">Berhasil!</strong> ${message}</div>`;
    } else {
        alertBox.classList.add('bg-rose-950/85', 'border-rose-400/50', 'text-rose-200');
        alertBox.innerHTML = `<span class="text-base">⚠️</span><div><strong class="text-rose-300">Perhatian!</strong> ${message}</div>`;
    }

    // Hilangkan notifikasi secara otomatis setelah 4 detik (4000 ms)
    alertTimer = setTimeout(() => {
        alertBox.style.opacity = '0';
        setTimeout(() => {
            alertBox.classList.add('hidden');
        }, 500);
    }, 4000);
}

// Mengecek ukuran file (maksimal 20MB) & memperbarui tampilan kotak upload
function updateFileDisplay(file) {
    if (!file) {
        fileLabelTitle.textContent = 'Tap atau seret file tugas ke sini';
        fileLabelSub.textContent = 'PDF, DOCX, ZIP, RAR, HTML, PHP, SQL, TXT';
        dropZone.classList.remove('border-amber-400', 'bg-blue-950/40');
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        showAlert('gagal', 'Ukuran file melebihi batas maksimal 20MB!');
        fileInput.value = '';
        return;
    }
    alertBox.classList.add('hidden');
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    fileLabelTitle.textContent = file.name;
    fileLabelSub.textContent = `Ukuran: ${sizeMB} MB — Siap dikirim`;
    dropZone.classList.add('border-amber-400', 'bg-blue-950/40');
}

// Event saat file dipilih lewat klik
fileInput.addEventListener('change', function() {
    updateFileDisplay(this.files[0]);
});

// Event interaksi Drag & Drop
['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
});

['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
});

dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files;
        updateFileDisplay(files[0]);
    }
});

// Mengonversi file menjadi teks Base64 agar bisa dikirim ke Google Drive
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// Proses pengiriman form saat tombol diklik
form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const file = fileInput.files[0];
    if (!file) {
        showAlert('gagal', 'Silakan pilih file tugas terlebih dahulu.');
        return;
    }

    btnSubmit.disabled = true;
    btnText.textContent = 'Mengunggah ke Google Drive...';
    alertBox.classList.add('hidden');

    try {
        const base64Data = await readFileAsBase64(file);
        const payload = {
            nama_mahasiswa: document.getElementById('nama_mahasiswa').value.trim(),
            nim: document.getElementById('nim').value.trim(),
            kelas: document.getElementById('kelas').value,
            mata_kuliah: document.getElementById('mata_kuliah').value,
            catatan: document.getElementById('catatan').value.trim(),
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            fileData: base64Data
        };

        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
        });

        showAlert('sukses', 'Tugas berhasil tersimpan di Google Drive & tercatat di rekap!');
        form.reset();
        updateFileDisplay(null);
    } catch (error) {
        showAlert('gagal', 'Terjadi gangguan jaringan. Silakan coba kirim ulang.');
    } finally {
        btnSubmit.disabled = false;
        btnText.textContent = 'Kirim Tugas Sekarang';
    }
});