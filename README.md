# SMART LATE RECORD — Panduan Setup

Sistem rekod kelewatan murid. Guna Google Sheets + Apps Script, login dengan akaun DELIMa.

## Fail

| Fail | Guna |
|---|---|
| `Code.gs` | Backend (Apps Script) |
| `Index.html` | Paparan web app (phone/tablet) |

## Langkah setup (sekali sahaja, ~20 minit)

Buat semua langkah ni dengan **akaun DELIMa guru admin**.

1. **Buat Google Sheet baru** dalam Google Drive DELIMa. Namakan `Smart Late Record`.
2. Dalam Sheet tu, buka **Extensions > Apps Script**.
3. Padam kod dalam `Code.gs`, kemudian paste isi fail `Code.gs`.
4. Klik **+ > HTML**, namakan `Index` (tanpa .html), kemudian paste isi `Index.html`.
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
