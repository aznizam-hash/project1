# SMART LATE RECORD — Panduan Setup

Sistem rekod kelewatan murid. Guna Google Sheets + Apps Script. Pengguna login dengan **ID dan PIN 6 digit** (contoh `PGW001`), bukan akaun Google.

## Fail

| Fail | Guna |
|---|---|
| `Code.gs` | Backend (Apps Script) |
| `index.html` | Paparan web app (phone/tablet) |
| `demo.js` | Mod demo untuk GitHub Pages sahaja. **Jangan** masukkan ke Apps Script |

## Cuba demo dulu

Buka https://aznizam-hash.github.io/project1/ untuk cuba UI dengan data rekaan. Data demo hanya disimpan dalam browser masing-masing dan tidak masuk ke Google Sheets.

Akaun demo (PIN semua `246810`): `ADM001` (admin), `GRU001` (guru disiplin), `PGW001` (pengawas), `PGW002` (pengawas yang perlu tukar PIN). Dalam demo, waktu bertugas pengawas dibuka sepanjang hari supaya boleh dicuba bila-bila masa.

## Peranan

| Peranan | ID | Tab |
|---|---|---|
| Pengawas | PGW001, PGW002, ... | Rekod, Hari ini (rekod sendiri sahaja). Login hanya dalam waktu bertugas |
| Guru disiplin | GRU001, ... | Rekod, Hari ini, Laporan |
| Admin | ADM001, ... | Rekod, Hari ini, Laporan, Pelajar |

## Langkah setup (sekali sahaja, ~20 minit)

Buat semua langkah ni dengan **akaun domain sekolah**. Fail Sheets dan projek Apps Script mesti dimiliki akaun sekolah.

1. **Buat Google Sheet baru**. Namakan `Smart Late Record`.
2. Dalam Sheet tu, buka **Extensions > Apps Script**.
3. Padam kod dalam `Code.gs`, kemudian paste isi fail `Code.gs`.
4. Klik **+ > HTML**, namakan `Index` (huruf besar I, tanpa .html), kemudian paste isi `index.html`.
5. Dalam `Code.gs`, edit bahagian `CONFIG`: `NAMA_SEKOLAH`, `KOD_SEKOLAH`, dan `LOGO_URL` kalau ada. Lepas tu tekan Save.
6. Kembali ke Sheet dan refresh. Menu **Smart Late Record** akan muncul.
7. Klik **Smart Late Record > 1. Setup tab**, kemudian beri kebenaran (Authorize) bila diminta.
   - Tab `MURID`, `REKOD`, `Pengguna`, `Tetapan`, `LogAudit` dan `IMPORT_APDM` akan dibuat.
   - Akaun admin pertama (`ADM001`) dicipta. **Catat PIN sementara yang dipaparkan.** Ia tak akan dipaparkan lagi.
8. **Tambah pengguna:** **Smart Late Record > 2. Tambah pengguna**. Isi nama dan peranan (`PENGAWAS`, `GURU` atau `ADMIN`). ID dijana automatik dan PIN sementara dipaparkan sekali. Beri PIN tu kepada pengguna secara peribadi.
9. Semak tab `Tetapan` (waktu bertugas pengawas, had lewat, had tindakan, senarai sebab). Buat masa ni nilai diubah terus dalam Sheet. Borang tetapan dalam web app akan datang.
10. **Data murid:** untuk ujian, guna **4. Masukkan murid olok-olok**. Jangan guna data murid sebenar sehingga semua ujian peranan lulus.
11. **Deploy:** dalam Apps Script, pergi ke **Deploy > New deployment > Web app**.
    - Execute as: **Me**
    - Who has access: **belum diputuskan** (lihat brief bahagian 8). Pilihan "Anyone within [domain]" bermaksud pengguna perlu login Google domain dulu, kemudian ID+PIN.
    - Klik Deploy, kemudian copy URL.

> Hanya admin patut ada akses edit pada Google Sheet. Sesiapa yang boleh edit Sheet boleh jalankan menu (tambah pengguna, reset PIN). Pengawas dan guru hanya guna URL web app.

## Login dan PIN

- Login pertama: pengguna wajib tukar PIN sementara. PIN mudah (contoh `111111`, `123456`) ditolak.
- PIN disimpan sebagai hash SHA-256 (dengan salt, diulang 1000 kali). Admin tak boleh lihat PIN.
- Lupa PIN: admin guna **3. Reset PIN pengguna**. Sesi lama pengguna tersebut terus terbatal.
- 5 kali PIN salah berturut-turut: akaun dikunci 15 minit.
- Sesi disimpan di server. Tamat jika tiada aktiviti: pengawas 3 minit, guru dan admin 30 minit. Sesi pengawas juga tamat pada `tetingkap_pengawas_tamat` (asal 09:00).
- Refresh halaman = perlu login semula.
- Semua login (berjaya dan gagal), tukar/reset PIN, rekod dibuat atau dipadam, dan import murid direkod dalam tab `LogAudit`.

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

- [ ] Login dengan tiga akaun ujian (satu setiap peranan). Setiap satu dipaksa tukar PIN dan nampak tab yang betul sahaja.
- [ ] PIN salah 5 kali: akaun dikunci 15 minit, dan setiap cubaan ada dalam `LogAudit`.
- [ ] Pengawas login di luar waktu bertugas: keluar mesej "Di luar waktu bertugas".
- [ ] Biar pengawas tak buat apa-apa 3 minit, kemudian tekan apa-apa: kembali ke skrin login.
- [ ] Kalau Google sendiri yang sekat URL web app, mungkin setting domain tak benarkan.
- [ ] Rekod seorang murid, kemudian semak baris baru dalam tab REKOD.
- [ ] Rekod murid yang sama sekali lagi. Sepatutnya keluar amaran "Sudah direkod hari ini".
- [ ] Rekod sebelum 7:20 pagi. Sepatutnya keluar amaran "belum waktu lewat".
- [ ] Pengawas tak nampak tab Laporan, hanya nampak rekod sendiri dalam Hari ini, dan tak boleh edit atau padam rekod.
- [ ] Laporan: Cetak/PDF dan Download CSV berfungsi pada phone dan PC.

## Nota PDPA

- Data disimpan: No. Daftar, Nama, Kelas, dan rekod kelewatan sahaja. Tiada IC.
- Akses dikawal ikut tab `Pengguna`. Setiap request semak sesi dan peranan di server. Tiada data dimuat sebelum login.
- Cadangan: pada awal tahun baru, buat salinan Sheet sebagai arkib, kemudian kosongkan tab REKOD dan import semula data murid.
