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
| Admin | ADM001, ... | Rekod, Hari ini, Pelajar, Laporan, Tetapan (Pengguna, Sistem, Log) |

## Langkah setup (sekali sahaja, ~20 minit)

Buat semua langkah ni dengan **akaun domain sekolah**. Fail Sheets dan projek Apps Script mesti dimiliki akaun sekolah.

1. **Buat Google Sheet baru**. Namakan `SemarakLateRecord`.
2. Dalam Sheet tu, buka **Extensions > Apps Script**.
3. Padam kod dalam `Code.gs`, kemudian paste isi fail `Code.gs`.
4. Klik **+ > HTML**, namakan `Index` (huruf besar I, tanpa .html), kemudian paste isi `index.html`.
5. `NAMA_SEKOLAH` dalam bahagian `CONFIG` (baris 15 `Code.gs`) sudah diisi `SMK Mengkarak`. Tukar hanya jika guna untuk sekolah lain. Tekan Save.
6. Kembali ke Sheet dan refresh. Menu **SemarakLateRecord** akan muncul.
7. Klik **SemarakLateRecord > 1. Setup tab**, kemudian beri kebenaran (Authorize) bila diminta.
   - Tab `Murid`, `Rekod`, `Pengguna`, `Tetapan` dan `LogAudit` akan dibuat. Tab versi lama (contoh `MURID` dengan No. Daftar) ditukar nama jadi `..._LAMA`, tidak dipadam.
   - Akaun admin pertama (`ADM001`) dicipta. **Catat PIN sementara yang dipaparkan.** Ia tak akan dipaparkan lagi.
8. **Tambah pengguna:** login ke web app sebagai `ADM001`, buka tab **Pengguna**. (Atau guna menu **SemarakLateRecord > 2. Tambah pengguna** dalam Sheet.) ID dijana automatik dan PIN sementara dipaparkan sekali. Beri PIN tu kepada pengguna secara peribadi.
9. Semak tetapan dalam web app: tab **Tetapan > Sistem** (waktu bertugas pengawas, had lewat, had tindakan, senarai sebab).
10. **Data murid:** untuk ujian, guna **4. Masukkan murid olok-olok**. Jangan guna data murid sebenar sehingga semua ujian peranan dan import lulus.
11. **Deploy:** dalam Apps Script, pergi ke **Deploy > New deployment > Web app**.
    - Execute as: **Me**
    - Who has access: **belum diputuskan** (lihat brief bahagian 8). Pilihan "Anyone within [domain]" bermaksud pengguna perlu login Google domain dulu, kemudian ID+PIN.
    - Klik Deploy, kemudian copy URL.

> Hanya admin patut ada akses edit pada Google Sheet. Sesiapa yang boleh edit Sheet boleh jalankan menu (tambah pengguna, reset PIN). Pengawas dan guru hanya guna URL web app.

## Login dan PIN

- Login pertama: pengguna wajib tukar PIN sementara. PIN mudah (contoh `111111`, `123456`) ditolak.
- PIN disimpan sebagai hash SHA-256 (dengan salt, diulang 1000 kali). Admin tak boleh lihat PIN.
- Lupa PIN atau akaun dikunci: admin buka tab **Pengguna**, ketik nama, tekan **Reset PIN**. Sesi lama pengguna tersebut terus terbatal dan kunci dibuka. Admin tak boleh reset PIN sendiri dalam web app (guna menu Sheet **3. Reset PIN pengguna** atau minta admin lain).
- 5 kali PIN salah berturut-turut: akaun dikunci 15 minit.
- Sesi disimpan di server. Tamat jika tiada aktiviti: pengawas 3 minit, guru disiplin 30 minit, admin 15 minit. Sesi pengawas juga tamat pada `tetingkap_pengawas_tamat` (asal 09:00).
- Refresh halaman = perlu login semula.
- Semua login (berjaya dan gagal), tukar/reset PIN, rekod dibuat atau dibatalkan, perubahan murid dan import direkod dalam tab `LogAudit`.

## Urus pengguna (admin)

Tab **Tetapan > Pengguna** dalam web app:
- **Tambah pengguna:** nama dan peranan. ID (`PGW001`, `GRU001`, `ADM001`, ...) dijana ikut peranan. PIN sementara dipaparkan sekali sahaja.
- **Reset PIN:** ketik pengguna, tekan Reset PIN. PIN sementara baharu dipaparkan sekali, dan akaun yang dikunci dibuka.
- **Aktif / tidak aktif:** pengguna yang dijadikan tidak aktif terus dilog keluar dan tak boleh login. Pengguna tak dipadam supaya rekod lama masih menunjukkan siapa yang merekod.
- Admin tak boleh ubah akaun sendiri dalam web app.
- Hash PIN dan salt tidak pernah dihantar ke pelayar.

## Tetapan sistem (admin)

Tab **Tetapan > Sistem** dalam web app. Tiada perubahan kod diperlukan.

| Tetapan | Nilai asal | Kesan |
|---|---|---|
| Waktu bertugas pengawas | 07:00 hingga 09:00 | Pengawas hanya boleh login dalam tempoh ini. Sesi pengawas yang sedang aktif tamat terus jika waktu tamat diawalkan. |
| Had lewat | 07:20 | Selepas masa ini dikira lewat. Tepat pada masa ini tidak lewat. |
| Had tindakan sebulan | 3 | Bilangan lewat sebulan untuk senarai "Capai had tindakan" dalam Laporan. |
| Sebab lewat | 5 pilihan | Pilihan semasa merekod (maks 15, tiada koma). Rekod lama tidak berubah. |

Semua nilai disemak sebelum disimpan. Jika satu tidak sah, tiada apa disimpan. Setiap perubahan direkod dalam `LogAudit` (nilai lama dan baharu).

## Log audit (admin)

Tab **Tetapan > Log**. Tapis ikut tarikh, pengguna dan jenis tindakan. Paparan tunjuk 500 entri terbaharu; tindakan penting (login gagal, rekod dibatalkan, PIN direset, tetapan diubah, import) ditanda merah. **Eksport CSV** untuk simpanan atau semakan lanjut.

Log tidak boleh dipadam atau diubah dari web app. Hanya orang yang ada akses edit pada Sheet boleh ubah tab `LogAudit`.

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
- **Edit pelajar:** ketik nama dalam senarai untuk ubah nama, tingkatan, kelas atau status. ID kekal, jadi rekod lama masih di bawah pelajar yang sama. Perubahan direkod dalam `LogAudit`.
- **Pindah atau berhenti:** tekan butang status **Aktif** (atau Edit) untuk tukar jadi tidak aktif. Rekod lama kekal dalam laporan.
- **Import CSV:** muat turun template, isi dalam Excel, Save As **CSV UTF-8**, kemudian pilih fail.
  - Lajur wajib: `Nama, Tingkatan, Kelas` (Tingkatan 1 hingga 6, Kelas contoh `Amanah`).
  - Sistem semak dulu. Jika ada satu baris bermasalah, **tiada apa disimpan** dan senarai ralat dipaparkan.
  - Jika fail ada lajur `ID_Murid` (dari butang Eksport), baris yang ada ID dipadankan ikut ID dan nama/tingkatan/kelas dikemas kini. Baris tanpa ID dipadankan ikut nama + tingkatan + kelas, atau ditambah sebagai pelajar baharu. Pelajar yang **tiada dalam fail ditanda tidak aktif** (tidak dipadam). Jadi fail mesti senarai penuh semua kelas.
  - Sebelum simpan, tab `Murid` dibackup ke tab baharu `Murid_backup_<tarikh>`.
  - Teks yang bermula dengan `=`, `+`, `-` atau `@` disimpan sebagai teks (elak formula injection).

### Awal tahun (kelas disusun semula)

1. Tab **Pelajar** > **Eksport senarai pelajar**. Fail CSV mengandungi `ID_Murid, Nama, Tingkatan, Kelas` untuk semua pelajar aktif.
2. Buka dalam Excel:
   - Tukar **Tingkatan** dan **Kelas** ikut susunan tahun baru.
   - **Padam baris** pelajar Tingkatan 5 yang tamat dan pelajar yang pindah keluar. Mereka akan jadi tidak aktif.
   - **Tambah baris** pelajar baharu dengan lajur `ID_Murid` dibiarkan kosong.
   - Jangan ubah lajur `ID_Murid` untuk pelajar sedia ada.
3. Save As **CSV UTF-8**, kemudian **Pilih fail CSV**. Semak ringkasan (baharu, dikemas kini, jadi tidak aktif) sebelum tekan **Simpan import**.

ID dan sejarah rekod setiap pelajar kekal walaupun kelas bertukar. Tab `Murid` dibackup secara automatik sebelum disimpan.

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
- [ ] Edit seorang pelajar (tukar kelas): ID sama, rekod lama masih ada dalam laporan.
- [ ] Tab Tetapan > Pengguna: tambah pengguna, reset PIN, jadikan tidak aktif. Pengguna tidak aktif terus dilog keluar.
- [ ] Tab Tetapan > Sistem: tukar had lewat, kemudian rekod murid. Status lewat ikut had baharu.
- [ ] Tab Tetapan > Log: login gagal, rekod dibuat dan perubahan tetapan semua kelihatan, dan tapisan pengguna berfungsi.
- [ ] Eksport, tukar kelas dalam Excel, import semula: ID kekal dan kelas baru dipaparkan.
- [ ] Laporan dan Eksport CSV berfungsi pada phone dan PC.

## Backup, simpanan dan pemadaman data

- **Backup:** menu **SemarakLateRecord > 5. Pasang backup mingguan**. Salinan Sheet dibuat setiap Isnin jam 2 pagi dalam folder Drive yang sama. Jalankan sekali sahaja. Sebelum import murid, tab `Murid` juga dibackup automatik.
- **Tempoh simpanan:** 2 tahun dari tarikh rekod. Rekod, dan salinan backup yang mengandungi rekod tu, dipadam bila tempoh tamat. Admin yang buat pemadaman. Tempoh ni cadangan, belum disahkan dengan arahan KPM atau pegawai PDPA sekolah.
- **Pemadaman automatik:** pasang sekali dengan menu **SemarakLateRecord > 7. Pasang pemadaman automatik**. Setiap bulan (tarikh 1, jam 3 pagi):
  - Baris `Rekod` dan `LogAudit` yang lebih 2 tahun dipadam terus dari Sheet.
  - Salinan backup yang lebih 2 tahun dipindah ke **Trash** Drive. Boleh dipulihkan dalam 30 hari, lepas tu dipadam kekal oleh Drive.
  - Satu entri `PEMADAMAN_AUTO` dicatat dalam `LogAudit` dengan jumlah yang dipadam.
- **Semak dulu:** menu **6. Semak data yang akan dipadam** tunjuk jumlah tanpa padam apa-apa. Guna menu ni sebelum tunggu bulan pertama.
- **Sebelum pemadaman pertama:** buat salinan Sheet secara manual sebagai arkib (File > Make a copy), dan simpan di tempat yang selamat.
- Pemadaman dalam Sheet tak boleh diundur. Data yang dipadam hanya boleh dipulihkan dari salinan arkib atau backup dalam Trash.
- **Skop data:** sistem ni hanya merekod kehadiran lewat. Tiada integrasi dengan MOEIS. Tiada nombor rasmi murid digunakan.

## Nota PDPA

- Data murid disimpan: ID sistem, Nama, Tingkatan, Kelas, Status, dan rekod kelewatan. Tiada No. KP atau IC.
- Akses dikawal ikut tab `Pengguna`. Setiap request semak sesi dan peranan di server. Tiada data dimuat sebelum login.
- Cadangan: pada awal tahun baru, buat salinan Sheet sebagai arkib, kemudian kosongkan tab `Rekod`. Tempoh simpan rekod masih belum diputuskan (brief bahagian 8).
