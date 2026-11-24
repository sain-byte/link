# Integrasi Google Drive Privat & Pembaruan Rules Vault (`sainbyte-170e3`)

Menghubungkan fitur unggah, pratinjau, unduh, dan hapus berkas pada `/vault/` langsung ke **Google Drive API resmi** menggunakan autentikasi Google dengan folder khusus Vault yang privat, sekaligus menyelaraskan skema serta aturan keamanan Firestore agar berjalan mulus pada proyek Firebase **`sainbyte-170e3`**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Seluruh keputusan Anda dari tahap klarifikasi telah diterapkan ke dalam rancangan teknis di bawah ini, beserta hal penting terkait proyek Firebase kustom Anda.

- **Integrasi Resmi Google Drive API (Terkonfirmasi)**: Menggantikan Firebase Storage untuk unggah file baru (foto, Excel, PDF, dokumen) dengan **Google Drive API (`drive.googleapis.com`)** melalui Google Sign-In OAuth (`drive.file`).
- **Folder Khusus Vault Privat (Terkonfirmasi)**: Aplikasi hanya meminta izin akses minimal (`drive.file`) untuk membuat dan mengelola folder privat khusus (`sainbyte-vault`) beserta berkas yang diunggah lewat Vault—tanpa membaca atau menyentuh file lain di Google Drive Anda.
- **Penggunaan Proyek Firebase `sainbyte-170e3` (Terkonfirmasi)**: Aplikasi tetap terhubung ke proyek `sainbyte-170e3`. Aturan keamanan terbaru (termasuk koleksi `vault` dan field Google Drive) akan diperbarui di kode proyek dan dilengkapi panduan serta tombol **Salin Rules** di antarmuka bila `sainbyte-170e3` belum mempublikasikan aturan terbaru di Firebase Console (`Firestore Database > Rules`), serta catatan pengaktifan Google Drive API pada proyek Cloud tersebut apabila menggunakan OAuth kustom.
- **Konfirmasi Izin Akses Drive Saat Eksekusi**: Setelah rencana ini disetujui, proses penyiapan integrasi Google Drive akan menampilkan kartu konfirmasi izin akses Google Drive resmi agar aplikasi dapat mengunggah dan mengelola berkas di folder Vault atas izin pengguna.

---

## 1. Overview & Core Concept

- **What It Does**: Memungkinkan pemilik Vault mengunggah foto, spreadsheet Excel/CSV, PDF, dan dokumen langsung ke folder privat `sainbyte-vault` di akun Google Drive pribadinya, melihat pratinjau gambar (*Lightbox*) maupun dokumen secara aman menggunakan token akses di memori, mengunduh, serta menghapus file dari Drive saat item Vault dihapus.
- **Target Audience / Persona**: Pemilik tunggal `sainbyte` yang menginginkan seluruh arsip file fisik tersimpan rapi dan privat di Google Drive pribadinya sendiri, sementara metadata dan catatan teks tersinkron real-time di Firestore proyek `sainbyte-170e3`.
- **Key Value**: Menghilangkan ketergantungan pada Firebase Storage (yang memerlukan aktivasi bucket terpisah) maupun webhook pihak ketiga, menjaga privasi file (tidak perlu mengubah file menjadi publik), dan memusatkan seluruh file di Google Drive pribadi.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Sesi Login & Koneksi Google Drive**: Saat pemilik membuka `/vault/` dengan akun Google terverifikasi, sesi otomatis menerima token akses Google Drive di memori (*in-memory*). Jika pengguna menyegarkan halaman atau sebelumnya masuk via Email/Password sehingga token Drive di memori belum tersedia, muncul banner status ringkas **Hubungkan Google Drive** satu klik di bagian atas ruang kerja (dan otomatis diminta bila pengguna mencoba mengunggah/membuka file privat Drive).
  2. **Unggah Foto & Dokumen ke Folder Privat**: Pada modal `+ Tambah Arsip Baru` kategori *Dokumen & Sheet* (`doc`) atau *Galeri & Aset* (`media`), memilih file langsung menampilkan pratinjau lokal dan mengunggah ke folder `sainbyte-vault` di Google Drive dengan indikator progres persentase (*0%–100%*).
  3. **Pratinjau & Unduh Privat Tanpa Link Publik**:
     - Kartu **Galeri & Aset (`media`)** mengambil aliran media terautentikasi menggunakan *Bearer token* dan menampilkannya sebagai *Blob URL* lokal di dalam kartu dan modal *Lightbox*, sehingga foto pribadi tetap terkunci privat di Google Drive.
     - Kartu **Dokumen & Sheet (`doc`)** menyediakan tombol **Preview** (menampilkan PDF/teks/gambar melalui *Blob URL* aman atau tautan buka di Google Drive untuk format spreadsheet biner seperti `.xlsx`), serta tombol **Unduh** langsung dengan nama berkas asli.
  4. **Penghapusan Terkonfirmasi**: Menekan tombol hapus selalu membuka dialog konfirmasi yang menjelaskan bahwa item Firestore dan file terkait di Google Drive akan dihapus sebelum eksekusi API penghapusan berjalan.
  5. **Pemulihan Izin Firestore (`sainbyte-170e3`)**: Apabila proyek `sainbyte-170e3` mengembalikan `permission-denied` karena aturan belum dipublikasikan di Console, spanduk error menyertakan tombol **Salin firestore.rules** satu klik agar aturan siap langsung ditempel ke *Firestore Database > Rules*.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Mempertahankan tema **Cyber-Minimalist Dark Vault** dengan kontras tinggi, garis batas tipis `1px`, dan umpan balik status koneksi Drive yang jelas.
  - *Color Palette & Mood*: Latar dasar `#09090B`, sidebar `#0C0C0F`, permukaan kartu `#121216`, garis batas `#27272A`, aksen utama Emerald `#10B981` untuk aksi Vault, serta tombol resmi bergaya *Sign in with Google* saat menghubungkan ulang izin Google Drive.
  - *Typography & Hierarchy*: *Plus Jakarta Sans* untuk keterbacaan antarmuka dan *JetBrains Mono* (`tabular-nums`) untuk nama file, ukuran byte, progres unggah, tag, serta status token Drive.
  - *Component Styling & Layout*: Tata letak tetap menggunakan *Hybrid Left Sidebar* (`w-64` desktop, *slide-over drawer* mobile), header pencarian lengket, dan grid kartu elevasi tunggal dengan lencana status Drive ringkas di bilah atas.

- **Interactive Feedback & Motion**:
  - Bilah progres unggah real-time (menggunakan `XMLHttpRequest` resumable/progress upload ke Google Drive API).
  - Indikator status pemuatan *thumbnail* saat mengambil blob gambar privat dari Drive.
  - Pesan error spesifik bila kuota Drive habis, token kedaluwarsa (*auto-prompt* sambungkan ulang Drive), atau aturan Firestore `sainbyte-170e3` belum diperbarui.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Scope Minimal `drive.file` + Folder Khusus `sainbyte-vault`**
  - *Chosen Approach*: Menggunakan izin `https://www.googleapis.com/auth/drive.file` dan otomatis membuat/memakai satu folder `sainbyte-vault`.
  - *Why*: Memenuhi prinsip *least privilege* dan sesuai pilihan Anda—aplikasi hanya dapat mengakses folder dan file yang dibuatnya sendiri tanpa melihat file pribadi lainnya di Google Drive.
  - *Alternatives Considered*: Izin penuh `drive`; tidak dipilih karena terlalu luas dan melampaui kebutuhan ruang kerja privat Vault.

- **Decision 2: Penyimpanan Token OAuth Eksklusif di Memori + Pengambilan Blob Terautentikasi**
  - *Chosen Approach*: Menyimpan token akses Google Drive hanya di variabel memori JavaScript (dibersihkan saat keluar/logout) dan mengambil pratinjau gambar/unduhan lewat header `Authorization: Bearer`.
  - *Why*: Mencegah kebocoran token melalui `localStorage`/`sessionStorage` dan menjaga file Google Drive tetap privat tanpa perlu izin baca publik (`anyone`).
  - *Alternatives Considered*: Membagikan setiap file sebagai *anyone with link*; dilewati demi menjaga privasi penuh berkas sensitif di Vault.

- **Decision 3: Kompatibilitas Skema Ganda + Dukungan Rules Proyek `sainbyte-170e3`**
  - *Chosen Approach*: Menambahkan field Google Drive (`driveFileId`, `driveViewUrl`, `fileName`, `fileSize`) pada skema dokumen `vault/{docId}` sambil tetap mempertahankan kompatibilitas field lama, serta menyediakan utilitas salin `firestore.rules` pada pesan error proyek kustom.
  - *Why*: Menjaga data yang sudah ada tetap valid dan memudahkan Anda memperbarui aturan di Firebase Console proyek `sainbyte-170e3` dalam hitungan detik.
  - *Alternatives Considered*: Menghapus skema lama atau memaksa ganti proyek; tidak dipilih agar konfigurasi `sainbyte-170e3` Anda tetap utuh.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Aplikasi Web Utama (/ & /vault)                     │
│                                                                         │
│  ┌──────────────────────────────┐    ┌───────────────────────────────┐  │
│  │  Auth & In-Memory Drive Auth │───▶│  Vault Workspace (/vault)     │  │
│  │  - Firebase Owner Auth       │    │  - Banner Status Koneksi Drive│  │
│  │  - Google OAuth Access Token │    │  - Grid Kartu 8 Kategori      │  │
│  │    (memori saja, nol storage)│    │  - Modal Upload / Preview     │  │
│  └──────────────┬───────────────┘    │  - Dialog Konfirmasi Hapus    │  │
│                 │                    └───────┬───────────────┬───────┘  │
└─────────────────┼────────────────────────────┼───────────────┼──────────┘
                  │                            │               │
                  │ Bearer Token               │ CRUD Metadata │ Multipart/
                  │                            │               │ Resumable +
                  ▼                            ▼               │ Blob Fetch
        ┌───────────────────┐        ┌───────────────────┐     │
        │  Google OAuth 2   │        │ Cloud Firestore   │     ▼
        │  Scope:           │        │ Proyek:           │  ┌──────────────────────┐
        │  drive.file       │        │ sainbyte-170e3    │  │ Google Drive API v3  │
        └───────────────────┘        │ Koleksi: vault/   │  │ Folder:              │
                                     └───────────────────┘  │ sainbyte-vault/      │
                                                            │ - Upload, Media Blob │
                                                            │ - Download & Delete  │
                                                            └──────────────────────┘
```

- **Data Model & State**:
  - **Entitas `VaultItem` (`vault/{docId}`)**: Mempertahankan `type`, `title`, `tags`, `content`, `dueDate`, `done`, `mimeType`, `createdAt`, serta menambahkan field opsional `driveFileId` (ID file Google Drive), `driveViewUrl` (`webViewLink` Drive), `fileName`, dan `fileSize` (integer byte), sambil menjaga `storagePath` & `downloadUrl` tetap opsional untuk kompatibilitas mundur.
  - **Aturan Keamanan Firestore (`firestore.rules` & Blueprint)**: Memperbarui fungsi validasi `isValidVaultItem` agar menerima field Google Drive baru dengan batas panjang/tipe ketat, menjaga `createdAt` *immutable*, memvalidasi via ESLint security rules, serta menyediakan isi aturan lengkap agar mudah dipublikasikan ke proyek `sainbyte-170e3`.
  - **State Memori Google Drive**: `driveAccessToken` disimpan hanya di memori aplikasi dan dibersihkan otomatis saat `logout()` atau perubahan status autentikasi; `blobUrlCache` menyimpan *Object URL* sementara untuk pratinjau media/dokumen privat dan dibersihkan saat keluar halaman.

- **Interactive Component & State Mapping**:
  - **Google Drive Client Service**: Mengelola `ensureVaultFolder()` (mencari atau membuat folder `sainbyte-vault` di Drive), `uploadFileToDrive()` (unggah dengan pelacakan progres ke folder `sainbyte-vault`), `fetchDriveBlobUrl()` (mengambil file privat untuk pratinjau gambar/PDF atau unduhan), dan `deleteDriveFile()` (menghapus file berdasarkan `driveFileId` dengan penanganan `404` aman).
  - **Banner Koneksi Drive & Tombol Sign-In Google**: Apabila `isOwner` aktif namun `driveAccessToken` belum ada di memori (misalnya setelah refresh browser), bilah atas Vault menampilkan tombol resmi penghubung Google Drive satu klik untuk memperoleh token sesi baru tanpa harus logout dari aplikasi.
  - **Modal Tambah / Edit & Penggantian File**: Saat menyimpan kategori `doc` atau `media`, jika ada file baru dipilih, aplikasi memastikan token Drive aktif, mengunggah ke folder `sainbyte-vault`, menyimpan metadata (`driveFileId`, `driveViewUrl`, `fileName`, `fileSize`, `mimeType`, `content`) ke Firestore, dan menghapus file Drive lama bila user mengganti lampiran pada mode edit.
  - **Dialog Konfirmasi Hapus**: Memastikan setiap penghapusan item yang memiliki `driveFileId` meminta persetujuan eksplisit sebelum memanggil penghapusan di Google Drive dan Firestore.
