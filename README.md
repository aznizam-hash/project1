# SMART LATE RECORD — Panduan Setup

Sistem rekod kelewatan murid. Guna Google Sheets + Apps Script, login dengan akaun DELIMa.

## Fail

| Fail | Guna |
|---|---|
| `Code.gs` | Backend (Apps Script) |
| `index.html` | Paparan web app (phone/tablet) |
| `demo.js` | Mod demo untuk GitHub Pages sahaja. **Jangan** masukkan ke Apps Script |

## Cuba demo dulu

Buka https://aznizam-hash.github.io/project1/ untuk cuba UI dengan data rekaan. Data demo hanya disimpan dalam browser masing-masing dan tidak masuk ke Google Sheets. Guna dropdown "Login sebagai" untuk tukar antara Admin dan Pengawas.

## Langkah setup (sekali sahaja, ~20 minit)

Buat semua langkah ni dengan **akaun DELIMa guru admin**.

1. **Buat Google Sheet baru** dalam Google Drive DELIMa. Namakan `Smart Late Record`.
2. Dalam Sheet tu, buka **Extensions > Apps Script**.
3. Padam kod dalam `Code.gs`, kemudian paste isi fail `Code.gs`.
4. Klik **+ > HTML**, namakan `Index` (huruf besar I, tanpa .html), kemudian paste isi `index.html`.
5. Dalam `Code.gs`, edit bahagian `CONFIG`: `NAMA_SEKOLAH`, `KOD_SEKOLAH`, dan `LOGO_URL` kalau ada. Lepas tu tekan Save.
6. Kembali ke Sheet dan refresh. Menu **Smart Late Record** akan muncul.
7. Klik **Smart Late Record > 1. Setup tab**, kemudian beri kebenaran (Authorize) bila diminta.
   - Tab `MURID`, `PENGGUNA`, `SEBAB`, `REKOD` dan `IMPORT_APDM` akan dibuat secara automatik.
   - Email anda akan dimasukkan sebagai ADMIN.
8. **Tambah pengguna** dalam tab `PENGGUNA`:

   | Email | Nama | Peranan |
   |---|---|---|
   | guru1@moe-dl.edu.my | Cikgu A | ADMIN |
   | guru2@moe-dl.edu.my | Cikgu B | ADMIN |
   | pengawas1@moe-dl.edu.my | Pengawas 1 | PENGAWAS |
   | pengawas2@moe-dl.edu.my | Pengawas 2 | PENGAWAS |

9. **Import data murid:**
   - Export senarai murid dari APDM ke Excel/CSV.
   - Copy semua data, termasuk baris header, dan paste ke tab `IMPORT_APDM`.
   - Klik **Smart Late Record > 2. Import data murid (APDM)**.
   - Kalau keluar mesej "Header tidak dijumpai", tambah nama header yang betul dalam `CONFIG.APDM_HEADER`, kemudian cuba semula.
   - Lepas import, tab `IMPORT_APDM` dikosongkan secara automatik. Sistem cuma simpan No. Daftar, Nama dan Kelas.
10. Semak senarai dalam tab `SEBAB`. Boleh tambah atau ubah ikut keperluan sekolah. Kekalkan `Lain-lain`.
11. **Deploy:** dalam Apps Script, pergi ke **Deploy > New deployment > Web app**.
    - Execute as: **Me**
    - Who has access: **Anyone within [domain DELIMa]**
    - Klik Deploy, kemudian copy URL.
12. Kongsi URL tersebut kepada 4 pengguna. Pada phone, buka URL dalam Chrome dan pilih **Add to Home Screen**.

> Pengawas **tidak perlu** akses kepada Google Sheet. Mereka hanya guna URL web app. Jangan share Sheet kepada murid.

## Urus murid (murid baru, pindah, tukar kelas)

Admin boleh buat semua ni dalam web app, melalui tab **Murid**:
- **Murid baru:** isi No. Daftar, Kelas dan Nama, kemudian tekan Tambah Murid.
- **Pindah atau berhenti:** Edit, kemudian tukar Status jadi Tidak aktif. Rekod lama murid tu kekal dalam laporan.
- **Tukar kelas:** Edit, kemudian tukar Kelas.
- **Tambah pukal (CSV):** muat turun Template CSV, isi dalam Excel, kemudian Save As **CSV UTF-8**. Pilih fail tu dan tekan Import.
  - Kolum yang perlu ada: `NoDaftar, Nama, Kelas`. Fail export APDM pun boleh, dan kolum lain akan diabaikan.
  - No. Daftar yang sudah wujud akan dilangkau. Tick "Kemas kini" kalau nak kemas kini nama atau kelas murid tersebut.
  - Baris yang ada ralat akan disenaraikan ikut nombor baris. Baris lain tetap diimport.

Import APDM sesuai untuk awal tahun sahaja, sebab import akan ganti seluruh senarai murid.

## Kemas kini kod

Lepas ubah kod: **Deploy > Manage deployments > Edit (ikon pensel) > Version: New version > Deploy**. URL tak berubah.

## Senarai semak ujian (buat sebelum guna sebenar)

- [ ] Akaun pengawas boleh buka web app. Kalau dapat "Tiada akses", semak email dalam tab PENGGUNA. Kalau Google sendiri yang sekat, mungkin setting domain DELIMa tak benarkan.
- [ ] Rekod seorang murid, kemudian semak baris baru dalam tab REKOD.
- [ ] Rekod murid yang sama sekali lagi. Sepatutnya keluar amaran "Sudah direkod hari ini".
- [ ] Rekod sebelum 7:20 pagi. Sepatutnya keluar amaran "belum waktu lewat".
- [ ] Pengawas tak nampak tab Laporan dan tak boleh edit atau padam rekod.
- [ ] Laporan: Cetak/PDF dan Download CSV berfungsi pada phone dan PC.

## Nota PDPA

- Data disimpan: No. Daftar, Nama, Kelas, dan rekod kelewatan sahaja. Tiada IC.
- Akses dikawal ikut senarai dalam tab PENGGUNA. Setiap request disemak di server.
- Cadangan: pada awal tahun baru, buat salinan Sheet sebagai arkib, kemudian kosongkan tab REKOD dan import semula data murid.
