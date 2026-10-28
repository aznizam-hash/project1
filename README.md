# SemarakLateRecord — Panduan Setup

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
| Admin | ADM001, ... | Rekod, Hari ini, Pelajar, Laporan |

## Langkah setup (sekali sahaja, ~20 minit)

Buat semua langkah ni dengan **akaun domain sekolah**. Fail Sheets dan projek Apps Script mesti dimiliki akaun sekolah.

1. **Buat Google Sheet baru**. Namakan `SemarakLateRecord`.
2. Dalam Sheet tu, buka **Extensions > Apps Script**.
3. Padam kod dalam `Code.gs`, kemudian paste isi fail `Code.gs`.
4. Klik **+ > HTML**, namakan `Index` (huruf besar I, tanpa .html), kemudian paste isi `index.html`.
5. Dalam `Code.gs`, edit `NAMA_SEKOLAH` dalam bahagian `CONFIG`. Lepas tu tekan Save.
6. Kembali ke Sheet dan refresh. Menu **SemarakLateRecord** akan muncul.
7. Klik **SemarakLateRecord > 1. Setup tab**, kemudian beri kebenaran (Authorize) bila diminta.
   - Tab `Murid`, `Rekod`, `Pengguna`, `Tetapan` dan `LogAudit` akan dibuat. Tab versi lama (contoh `MURID` dengan No. Daftar) ditukar nama jadi `..._LAMA`, tidak dipadam.
   - Akaun admin pertama (`ADM001`) dicipta. **Catat PIN sementara yang dipaparkan.** Ia tak akan dipaparkan lagi.
8. **Tambah pengguna:** **SemarakLateRecord > 2. Tambah pengguna**. Isi nama dan peranan (`PENGAWAS`, `GURU` atau `ADMIN`). ID dijana automatik dan PIN sementara dipaparkan sekali. Beri PIN tu kepada pengguna secara peribadi.
9. Semak tab `Tetapan` (waktu bertugas pengawas, had lewat, had tindakan, senarai sebab). Buat masa ni nilai diubah terus dalam Sheet. Borang tetapan dalam web app akan datang.
10. **Data murid:** untuk ujian, guna **4. Masukkan murid olok-olok**. Jangan guna data murid sebenar sehingga semua ujian peranan dan import lulus.
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
- Semua login (berjaya dan gagal), tukar/reset PIN, rekod dibuat atau dibatalkan, perubahan murid dan import direkod dalam tab `LogAudit`.

## Rekod kelewatan

- Tab **Rekod**: cari murid ikut nama atau ID, ketik nama, pilih sebab (pilihan, boleh kosong), tekan **Rekod jam HH:MM**.
- Masa tiba dicap oleh server, bukan dari jam telefon. Masa tidak boleh diubah selepas disimpan.
- Selepas `had_lewat` (asal 07:20) dikira lewat. Tepat 07:20 tidak lewat. Rekod sebelum had tetap disimpan tapi ditanda **tidak lewat** dan tidak masuk laporan.
- Seorang murid hanya boleh direkod sekali sehari. Murid yang sudah direkod tunjuk masa rekod dalam senarai.

## Batal rekod

- Tab **Hari ini**: ketik rekod untuk batal.
- Pengawas dan guru disiplin hanya boleh batal rekod sendiri pada hari yang sama. Admin boleh batal rekod sesiapa, tapi wajib isi catatan.
- Rekod tidak dipadam. Kolum `Dibatalkan`, `ID_Pembatal`, `Tarikh_Batal` dan `Catatan_Batal` diisi, dan rekod tidak dikira dalam laporan.

## Urus pelajar (admin)

Tab **Pelajar** dalam web app:
- **Tambah seorang pelajar:** isi nama, tingkatan dan kelas. ID (`MUR0001`, `MUR0002`, ...) dijana sistem dan tidak pernah digunakan semula.
- **Pindah atau berhenti:** tekan butang status **Aktif** untuk tukar jadi tidak aktif. Rekod lama kekal dalam laporan.
- **Import CSV:** muat turun template, isi dalam Excel, Save As **CSV UTF-8**, kemudian pilih fail.
  - Lajur wajib: `Nama, Tingkatan, Kelas` (Tingkatan 1 hingga 5, Kelas contoh `Amanah`).
  - Sistem semak dulu. Jika ada satu baris bermasalah, **tiada apa disimpan** dan senarai ralat dipaparkan.
  - Pelajar sedia ada dipadankan ikut nama + tingkatan + kelas. Pelajar baharu ditambah. Pelajar yang **tiada dalam fail ditanda tidak aktif** (tidak dipadam). Jadi fail mesti senarai penuh semua kelas.
  - Sebelum simpan, tab `Murid` dibackup ke tab baharu `Murid_backup_<tarikh>`.
  - Teks yang bermula dengan `=`, `+`, `-` atau `@` disimpan sebagai teks (elak formula injection).

> Had padanan ikut nama: bila murid naik tingkatan awal tahun, tingkatan dalam fail baharu berbeza, jadi sistem akan cipta ID baharu dan tandakan ID lama tidak aktif. Rekod lama kekal di bawah ID lama.

## Laporan (guru disiplin dan admin)

- Pilih tarikh mula, tarikh akhir dan kelas.
- Ringkasan: jumlah kes kelewatan dan bilangan pelajar terlibat.
- **Paling kerap lewat** dalam tempoh dipilih.
- **Capai had tindakan**: pelajar yang lewat `had_tindakan_sebulan` kali atau lebih dalam bulan semasa.
- **Eksport CSV** untuk senarai penuh dalam tempoh dipilih.

## Kemas kini kod

Lepas ubah kod: **Deploy > Manage deployments > Edit (ikon pensel) > Version: New version > Deploy**. URL tak berubah.

## Senarai semak ujian (buat sebelum guna sebenar)

- [ ] Login dengan tiga akaun ujian (satu setiap peranan). Setiap satu dipaksa tukar PIN dan nampak tab yang betul sahaja.
- [ ] PIN salah 5 kali: akaun dikunci 15 minit, dan setiap cubaan ada dalam `LogAudit`.
- [ ] Pengawas login di luar waktu bertugas: keluar mesej "Di luar waktu bertugas".
- [ ] Biar pengawas tak buat apa-apa 3 minit, kemudian tekan apa-apa: kembali ke skrin login.
- [ ] Kalau Google sendiri yang sekat URL web app, mungkin setting domain tak benarkan.
- [ ] Rekod seorang murid, kemudian semak baris baru dalam tab `Rekod` (masa diisi server).
- [ ] Ketik murid yang sama sekali lagi: keluar mesej "Sudah direkod hari ini".
- [ ] Rekod sebelum atau tepat 07:20: disimpan dengan `Lewat = tidak`, tidak masuk laporan.
- [ ] Pengawas hanya nampak tab Rekod dan Hari ini, dan hanya rekod sendiri dalam Hari ini.
- [ ] Guru disiplin tidak boleh batal rekod pengawas. Admin boleh, dengan catatan.
- [ ] Import CSV dengan satu baris rosak: tiada apa disimpan. Import fail betul: tab backup dicipta.
- [ ] Laporan dan Eksport CSV berfungsi pada phone dan PC.

## Nota PDPA

- Data murid disimpan: ID sistem, Nama, Tingkatan, Kelas, Status, dan rekod kelewatan. Tiada No. KP atau IC.
- Akses dikawal ikut tab `Pengguna`. Setiap request semak sesi dan peranan di server. Tiada data dimuat sebelum login.
- Cadangan: pada awal tahun baru, buat salinan Sheet sebagai arkib, kemudian kosongkan tab `Rekod`. Tempoh simpan rekod masih belum diputuskan (brief bahagian 8).
