/**
 * SMART LATE RECORD — backend Google Apps Script
 * Script ini mesti dibuka dari Google Sheet (Extensions > Apps Script).
 *
 * Nota keselamatan:
 * - Function yang namanya berakhir dengan "_" ialah private dan tidak boleh
 *   dipanggil dari browser. Function lain semua boleh dipanggil melalui
 *   google.script.run, jadi setiap satu mesti semak sesi dulu (requireUser_).
 * - Function menu (menu...) panggil SpreadsheetApp.getUi() pada baris pertama.
 *   Panggilan itu gagal dari web app, jadi function menu hanya boleh dijalankan
 *   oleh orang yang ada akses edit pada Sheet. Hanya admin patut ada akses itu.
 */

const CONFIG = {
  NAMA_SEKOLAH: 'NAMA SEKOLAH ANDA',
  KOD_SEKOLAH: 'KOD SEKOLAH',
  LOGO_URL: '',              // pilihan: URL imej logo (kosongkan kalau tiada)
  ZON_WAKTU: 'Asia/Kuala_Lumpur',
  MAKS_HARI_LAPORAN: 366,
  SESI_MINIT: { PENGAWAS: 3, GURU: 30, ADMIN: 30 }, // tamat jika tiada aktiviti
  HAD_CUBAAN: 5,             // PIN salah berturut-turut sebelum akaun dikunci
  KUNCI_MINIT: 15,
  ITERASI_HASH: 1000,        // SHA-256 diulang supaya PIN 6 digit lebih sukar diteka jika Sheet bocor
  // Nama header dalam fail APDM yang diterima (huruf besar/kecil tak penting).
  // Tambah nama lain kalau header fail APDM sekolah berbeza.
  APDM_HEADER: {
    noDaftar: ['NODAFTAR', 'NO. DAFTAR', 'NO DAFTAR', 'NO. PENDAFTARAN', 'NO PENDAFTARAN', 'ID MURID', 'NO. MURID'],
    nama: ['NAMA', 'NAMA MURID'],
    kelas: ['KELAS', 'NAMA KELAS']
  }
};

const TAB = {
  MURID: 'MURID', REKOD: 'REKOD', IMPORT: 'IMPORT_APDM',
  PENGGUNA: 'Pengguna', TETAPAN: 'Tetapan', LOG: 'LogAudit'
};
const HEADERS = {
  MURID: ['NoDaftar', 'Nama', 'Kelas', 'Aktif'],
  REKOD: ['ID', 'Timestamp', 'Tarikh', 'Masa', 'MinitLewat', 'NoDaftar', 'Nama', 'Kelas', 'Sebab', 'Catatan', 'DirekodOleh'],
  Pengguna: ['ID_Pengguna', 'Nama', 'Peranan', 'Hash_PIN', 'Salt', 'Perlu_Tukar_PIN', 'Dikunci_Hingga', 'Status', 'Cubaan_Gagal'],
  Tetapan: ['Kunci', 'Nilai', 'Keterangan'],
  LogAudit: ['Masa', 'ID_Pengguna', 'Tindakan', 'Butiran']
};
const TETAPAN_LALAI = [
  ['tetingkap_pengawas_mula', '07:00', 'Pengawas boleh login dan rekod bermula masa ini'],
  ['tetingkap_pengawas_tamat', '09:00', 'Sesi pengawas tamat pada masa ini'],
  ['had_lewat', '07:20', 'Rekod selepas masa ini dikira lewat. Tepat 07:20 tidak lewat.'],
  ['had_tindakan_sebulan', '3', 'Bilangan kelewatan sebulan sebelum murid ditandakan untuk tindakan'],
  ['sebab_lewat', 'Masalah kenderaan, Bangun lewat, Hujan lebat, Urusan keluarga, Lain-lain', 'Pilihan sebab, dipisahkan dengan koma']
];
const PERANAN = { PENGAWAS: 'PGW', GURU: 'GRU', ADMIN: 'ADM' }; // peranan -> awalan ID
const SEBAB_LAIN = 'Lain-lain';
const SESI_TAMAT = 'Sesi tamat. Sila log masuk semula.';
const RALAT_LOGIN = 'ID atau PIN tidak sah.';

// ---------- Menu & setup (dijalankan dari Google Sheet) ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Smart Late Record')
    .addItem('1. Setup tab', 'setupSheets')
    .addItem('2. Tambah pengguna', 'menuTambahPengguna')
    .addItem('3. Reset PIN pengguna', 'menuResetPin')
    .addItem('4. Masukkan murid olok-olok (ujian)', 'menuMuridOlokOlok')
    .addSeparator()
    .addItem('Import data murid (APDM)', 'importApdm')
    .addToUi();
}

function setupSheets() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();

  // Versi lama guna tab PENGGUNA berasaskan email. Simpan sebagai arkib.
  ss.getSheets().forEach(function (sh) {
    if (sh.getName().toUpperCase() === 'PENGGUNA' && sh.getLastRow() > 0 &&
        String(sh.getRange(1, 1).getValue()).trim() === 'Email') {
      sh.setName('PENGGUNA_LAMA_EMAIL');
    }
  });

  Object.keys(HEADERS).forEach(function (name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEADERS[name]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold');
    }
  });
  if (!ss.getSheetByName(TAB.IMPORT)) ss.insertSheet(TAB.IMPORT);

  // Kolum teks supaya Sheets tak tukar jadi tarikh/nombor
  ss.getSheetByName(TAB.MURID).getRange('A:A').setNumberFormat('@');
  ss.getSheetByName(TAB.REKOD).getRange('C:D').setNumberFormat('@');
  ss.getSheetByName(TAB.REKOD).getRange('F:F').setNumberFormat('@');
  ss.getSheetByName(TAB.PENGGUNA).getRange('A:F').setNumberFormat('@');
  ss.getSheetByName(TAB.TETAPAN).getRange('A:B').setNumberFormat('@');
  ss.setSpreadsheetTimeZone(CONFIG.ZON_WAKTU);

  // Tambah kunci tetapan yang belum ada (nilai sedia ada tidak diubah)
  const tet = ss.getSheetByName(TAB.TETAPAN);
  const ada = tet.getDataRange().getDisplayValues().map(function (r) { return String(r[0]).trim(); });
  const baru = TETAPAN_LALAI.filter(function (r) { return ada.indexOf(r[0]) === -1; });
  if (baru.length) tet.getRange(tet.getLastRow() + 1, 1, baru.length, 3).setValues(baru);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PIN_PEPPER')) {
    props.setProperty('PIN_PEPPER', Utilities.getUuid() + Utilities.getUuid());
  }

  let mesej = 'Setup selesai.';
  if (readRows_(TAB.PENGGUNA).length === 0) {
    const a = tambahPengguna_('Admin', 'ADMIN');
    mesej += '\n\nAkaun admin pertama:\nID: ' + a.id + '\nPIN sementara: ' + a.pin +
      '\n\nCatat PIN ini sekarang. Ia tidak akan dipaparkan lagi. PIN wajib ditukar selepas login pertama.';
  }
  ui.alert(mesej);
}

function menuTambahPengguna() {
  const ui = SpreadsheetApp.getUi();
  const n = ui.prompt('Tambah pengguna', 'Nama penuh:', ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK) return;
  const p = ui.prompt('Tambah pengguna', 'Peranan (taip PENGAWAS, GURU atau ADMIN):', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  try {
    const a = tambahPengguna_(n.getResponseText(), p.getResponseText());
    ui.alert('Pengguna ditambah.\n\nID: ' + a.id + '\nPIN sementara: ' + a.pin +
      '\n\nPIN ini dipaparkan sekali sahaja. Pengguna wajib tukar PIN selepas login pertama.');
  } catch (e) {
    ui.alert(e.message);
  }
}

function menuResetPin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Reset PIN', 'ID pengguna (contoh: PGW001):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const id = String(r.getResponseText()).trim().toUpperCase();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const u = cariPengguna_(id);
    if (!u) { ui.alert('ID ' + id + ' tidak dijumpai.'); return; }
    const pin = pinRawak_();
    const salt = Utilities.getUuid();
    // Salt baru juga membatalkan semua sesi lama pengguna ini
    tulisPengguna_(u._row, { Hash_PIN: hashPin_(pin, salt), Salt: salt, Perlu_Tukar_PIN: 'ya', Dikunci_Hingga: '', Cubaan_Gagal: 0 });
    log_(penggunaSheet_(), 'PIN_DIRESET', id);
    ui.alert('PIN untuk ' + id + ' (' + u.Nama + ') telah direset.\n\nPIN sementara: ' + pin +
      '\n\nPIN ini dipaparkan sekali sahaja. Pengguna wajib tukar PIN selepas login.');
  } finally {
    lock.releaseLock();
  }
}

function menuMuridOlokOlok() {
  const ui = SpreadsheetApp.getUi();
  const sh = sheet_(TAB.MURID);
  if (sh.getLastRow() > 1) { ui.alert('Tab MURID sudah ada data. Data olok-olok hanya dimasukkan ke tab yang kosong.'); return; }
  const kelas = ['1 Amanah', '2 Bestari', '3 Cekal'];
  const rows = [];
  for (let i = 1; i <= 15; i++) {
    const n = ('0' + i).slice(-2);
    rows.push(['UJI00' + n, 'MURID UJIAN ' + n, kelas[(i - 1) % kelas.length], 'YA']);
  }
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  ui.alert(rows.length + ' murid olok-olok dimasukkan. Padam semua sebelum import data murid sebenar.');
}

function importApdm() {
  const ui = SpreadsheetApp.getUi();
  const sh = sheet_(TAB.IMPORT);
  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) {
    ui.alert('Tab IMPORT_APDM kosong. Paste data APDM (termasuk baris header) dahulu.');
    return;
  }

  let col;
  try { col = padanKolum_(values[0]); } catch (e) { ui.alert(e.message); return; }

  const seen = {};
  const rows = [];
  values.slice(1).forEach(function (r) {
    const id = String(r[col.noDaftar]).trim();
    const nama = String(r[col.nama]).trim();
    if (!id || !nama || seen[id]) return;
    seen[id] = true;
    rows.push([clean_(id, 30), clean_(nama, 150), clean_(String(r[col.kelas]).trim(), 50), 'YA']);
  });
  if (!rows.length) { ui.alert('Tiada data murid yang sah dijumpai.'); return; }

  const jawab = ui.alert('Import ' + rows.length + ' murid?\n\nSenarai MURID sedia ada akan diganti. Rekod kelewatan lama tidak terjejas.', ui.ButtonSet.YES_NO);
  if (jawab !== ui.Button.YES) return;

  const murid = sheet_(TAB.MURID);
  if (murid.getLastRow() > 1) murid.getRange(2, 1, murid.getLastRow() - 1, 4).clearContent();
  murid.getRange(2, 1, rows.length, 4).setValues(rows);
  sh.clear(); // buang salinan penuh APDM (mungkin ada IC, alamat dll.)
  log_(penggunaSheet_(), 'MURID_DIIMPORT', 'APDM: ' + rows.length + ' murid (ganti senarai)');
  ui.alert('Selesai. ' + rows.length + ' murid diimport. Tab IMPORT_APDM telah dikosongkan.');
}

// ---------- Web app ----------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Smart Late Record')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- Login & sesi ----------

function logMasuk(id, pin) {
  id = String(id || '').trim().toUpperCase().slice(0, 20);
  pin = String(pin || '');
  if (!id || !pin) throw new Error(RALAT_LOGIN);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const u = cariPengguna_(id);
    if (!u || !isAktifPengguna_(u)) {
      // Kira juga cubaan untuk ID yang tiada, supaya respons sama dan tak dedahkan ID mana yang wujud
      const cache = CacheService.getScriptCache();
      const n = (Number(cache.get('gagal_' + id)) || 0) + 1;
      cache.put('gagal_' + id, String(n), CONFIG.KUNCI_MINIT * 60);
      log_(id, 'LOGIN_GAGAL', 'ID tidak wujud atau tidak aktif');
      throw new Error(n >= CONFIG.HAD_CUBAAN ? ralatKunci_() : RALAT_LOGIN);
    }

    const dikunci = u.Dikunci_Hingga instanceof Date ? u.Dikunci_Hingga.getTime() : 0;
    if (dikunci > Date.now()) {
      log_(id, 'LOGIN_GAGAL', 'Akaun sedang dikunci');
      throw new Error(ralatKunci_());
    }

    if (hashPin_(pin, String(u.Salt)) !== String(u.Hash_PIN)) {
      pinSalah_(u);
      throw new Error(Number(u.Cubaan_Gagal) + 1 >= CONFIG.HAD_CUBAAN ? ralatKunci_() : RALAT_LOGIN);
    }

    if (Number(u.Cubaan_Gagal) || dikunci) tulisPengguna_(u._row, { Cubaan_Gagal: 0, Dikunci_Hingga: '' });

    const peranan = String(u.Peranan).trim().toUpperCase();
    let tamatSaat = 0;
    if (peranan === 'PENGAWAS') {
      const t = tetingkapPengawas_();
      if (!t.dalam) {
        log_(id, 'LOGIN_GAGAL', 'Di luar waktu bertugas');
        throw new Error('Di luar waktu bertugas (' + t.mula + ' hingga ' + t.tamat + ').');
      }
      tamatSaat = t.bakiSaat;
    }

    const s = {
      id: id, nama: String(u.Nama), peranan: peranan,
      perluTukar: String(u.Perlu_Tukar_PIN).trim().toLowerCase() === 'ya',
      v: String(u.Salt).slice(0, 8), akhir: Date.now()
    };
    const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    simpanSesi_(token, s);
    log_(id, 'LOGIN_BERJAYA', peranan);
    return { token: token, perluTukarPin: s.perluTukar, idleSaat: CONFIG.SESI_MINIT[peranan] * 60, tamatSaat: tamatSaat };
  } finally {
    lock.releaseLock();
  }
}

function tukarPin(token, pinLama, pinBaru) {
  const s = requireUser_(token, null, { bolehTukarPin: true });
  pinLama = String(pinLama || '');
  pinBaru = String(pinBaru || '');
  semakPinBaru_(pinBaru);
  if (pinBaru === pinLama) throw new Error('PIN baru mesti berbeza daripada PIN semasa.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const u = cariPengguna_(s.id);
    if (hashPin_(pinLama, String(u.Salt)) !== String(u.Hash_PIN)) {
      pinSalah_(u);
      if (Number(u.Cubaan_Gagal) + 1 >= CONFIG.HAD_CUBAAN) {
        CacheService.getScriptCache().remove('sesi_' + token);
        throw new Error(ralatKunci_());
      }
      throw new Error('PIN semasa tidak betul.');
    }
    const salt = Utilities.getUuid();
    tulisPengguna_(u._row, { Hash_PIN: hashPin_(pinBaru, salt), Salt: salt, Perlu_Tukar_PIN: 'tidak', Cubaan_Gagal: 0 });
    log_(s.id, 'TUKAR_PIN', '');
    s.perluTukar = false;
    s.v = salt.slice(0, 8);
    simpanSesi_(token, s);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function logKeluar(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return true;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('sesi_' + token);
  if (raw) {
    cache.remove('sesi_' + token);
    log_(JSON.parse(raw).id, 'LOGOUT', '');
  }
  return true;
}

// ---------- Data web app (semua perlu token sesi) ----------

function getInit(token) {
  const user = requireUser_(token);
  const t = tetapan_();
  return {
    user: { id: user.id, nama: user.nama, peranan: user.peranan },
    kelas: senaraiKelas_(),
    sebab: senaraiSebab_(),
    sebabLain: SEBAB_LAIN,
    config: {
      sekolah: CONFIG.NAMA_SEKOLAH,
      kod: CONFIG.KOD_SEKOLAH,
      logo: CONFIG.LOGO_URL,
      waktuLewat: t.had_lewat,
      hadKerap: hadTindakan_()
    }
  };
}

function getMuridKelas(token, kelas) {
  requireUser_(token);
  return readRows_(TAB.MURID)
    .filter(function (m) { return isAktif_(m) && String(m.Kelas) === String(kelas); })
    .map(pubMurid_)
    .sort(function (a, b) { return a.nama.localeCompare(b.nama); });
}

function cariMurid(token, q) {
  requireUser_(token);
  q = String(q || '').trim().toLowerCase();
  if (q.length < 3) return [];
  return readRows_(TAB.MURID)
    .filter(function (m) { return isAktif_(m) && String(m.Nama).toLowerCase().indexOf(q) > -1; })
    .slice(0, 20)
    .map(pubMurid_);
}

function simpanRekod(token, input) {
  const user = requireUser_(token);
  const ids = Array.isArray(input && input.noDaftar) ? input.noDaftar.map(String) : [];
  if (!ids.length) throw new Error('Pilih sekurang-kurangnya seorang murid.');
  if (ids.length > 60) throw new Error('Maksimum 60 murid sekali simpan.');
  const sebab = String(input.sebab || '').trim();
  const catatan = semakSebab_(sebab, input.catatan);

  const muridMap = {};
  readRows_(TAB.MURID).filter(isAktif_).forEach(function (m) { muridMap[String(m.NoDaftar)] = m; });
  const tiada = ids.filter(function (id) { return !muridMap[id]; });
  if (tiada.length) throw new Error('Murid tidak dijumpai: ' + tiada.join(', '));

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = sekarang_();
    const lewat = minitLewat_(t.minit);
    const rekod = readRekod_();

    const amaran = [];
    if (lewat <= 0) amaran.push('Sekarang ' + t.masa.slice(0, 5) + ', belum lewat (had ' + tetapan_().had_lewat + ').');
    const sudah = ids.filter(function (id) {
      return rekod.some(function (r) { return r.tarikh === t.tarikh && r.noDaftar === id; });
    });
    if (sudah.length) {
      amaran.push('Sudah direkod hari ini: ' + sudah.map(function (id) { return muridMap[id].Nama; }).join(', '));
    }
    if (amaran.length && !input.sahkan) return { perluSahkan: true, amaran: amaran };

    const minit = Math.max(0, lewat);
    const rows = ids.map(function (id) {
      const m = muridMap[id];
      return [Utilities.getUuid(), t.d, t.tarikh, t.masa, minit,
        clean_(m.NoDaftar, 30), clean_(m.Nama, 150), clean_(m.Kelas, 50), sebab, catatan, user.id];
    });
    const sh = sheet_(TAB.REKOD);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    log_(user.id, 'REKOD_DIBUAT', ids.join(', '));

    const had = hadTindakan_();
    const bulan = t.tarikh.slice(0, 7);
    const disimpan = ids.map(function (id) {
      const kali = rekod.filter(function (r) { return r.noDaftar === id && r.tarikh.slice(0, 7) === bulan; }).length + 1;
      return { nama: String(muridMap[id].Nama), kelas: String(muridMap[id].Kelas), kaliBulanIni: kali, kerap: kali >= had };
    });
    return { ok: true, disimpan: disimpan, minitLewat: minit };
  } finally {
    lock.releaseLock();
  }
}

function getRekodHariIni(token) {
  const user = requireUser_(token);
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const list = readRekod_().filter(function (r) {
    return r.tarikh === today && (user.peranan !== 'PENGAWAS' || r.oleh === user.id);
  }).map(pub_).reverse();
  return { list: list, bolehUbah: user.peranan === 'ADMIN' };
}

function kemaskiniRekod(token, id, sebab, catatan) {
  const user = requireUser_(token, ['ADMIN']);
  const c = semakSebab_(String(sebab || '').trim(), catatan);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const r = cariRekod_(id);
    sheet_(TAB.REKOD).getRange(r._row, 9, 1, 2).setValues([[sebab, c]]);
    log_(user.id, 'REKOD_DIUBAH', r.id + ' (' + r.noDaftar + ')');
    return true;
  } finally {
    lock.releaseLock();
  }
}

function padamRekod(token, id) {
  const user = requireUser_(token, ['ADMIN']);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const r = cariRekod_(id);
    sheet_(TAB.REKOD).deleteRow(r._row);
    log_(user.id, 'REKOD_DIPADAM', r.id + ' (' + r.noDaftar + ', ' + r.tarikh + ')');
    return true;
  } finally {
    lock.releaseLock();
  }
}

function getLaporan(token, p) {
  requireUser_(token, ['GURU', 'ADMIN']);
  p = p || {};
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(p.dari) || !re.test(p.hingga)) throw new Error('Tarikh tidak sah.');
  if (p.dari > p.hingga) throw new Error('Tarikh "Dari" mesti sebelum atau sama dengan "Hingga".');
  const hari = (new Date(p.hingga) - new Date(p.dari)) / 86400000 + 1;
  if (hari > CONFIG.MAKS_HARI_LAPORAN) throw new Error('Tempoh maksimum ' + CONFIG.MAKS_HARI_LAPORAN + ' hari.');
  const had = Math.max(1, parseInt(p.had, 10) || hadTindakan_());

  const list = readRekod_().filter(function (r) {
    return r.tarikh >= p.dari && r.tarikh <= p.hingga &&
      (!p.kelas || r.kelas === p.kelas) && (!p.sebab || r.sebab === p.sebab);
  }).map(pub_);
  list.sort(function (a, b) { return (a.tarikh + a.masa).localeCompare(b.tarikh + b.masa); });

  function kira(key) {
    const m = {};
    list.forEach(function (r) { const k = key(r); m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { k: k, n: m[k] }; })
      .sort(function (a, b) { return b.n - a.n || a.k.localeCompare(b.k); });
  }

  const ikutMurid = {};
  list.forEach(function (r) {
    const m = ikutMurid[r.noDaftar] || (ikutMurid[r.noDaftar] = { noDaftar: r.noDaftar, nama: r.nama, kelas: r.kelas, n: 0, minit: 0 });
    m.n++;
    m.minit += r.minit;
  });
  const kerap = Object.keys(ikutMurid).map(function (k) { return ikutMurid[k]; })
    .filter(function (m) { return m.n >= had; })
    .sort(function (a, b) { return b.n - a.n || a.nama.localeCompare(b.nama); });
  const ikutTarikh = kira(function (r) { return r.tarikh; });
  const jumlahMinit = list.reduce(function (s, r) { return s + r.minit; }, 0);

  return {
    dari: p.dari, hingga: p.hingga, had: had,
    ringkasan: {
      jumlah: list.length,
      murid: Object.keys(ikutMurid).length,
      hariPuncak: ikutTarikh[0] || null,
      purataMinit: list.length ? Math.round(jumlahMinit / list.length) : 0
    },
    ikutKelas: kira(function (r) { return r.kelas; }),
    ikutSebab: kira(function (r) { return r.sebab; }),
    kerap: kerap,
    list: list
  };
}

// ---------- Urus murid (admin) ----------

function getSenaraiMurid(token) {
  requireUser_(token, ['ADMIN']);
  return readRows_(TAB.MURID).filter(function (m) { return String(m.NoDaftar).trim(); })
    .map(function (m) {
      const o = pubMurid_(m);
      o.aktif = isAktif_(m);
      return o;
    })
    .sort(function (a, b) { return a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama); });
}

// baru = true untuk tambah murid; false untuk edit murid sedia ada (ikut noDaftar)
function simpanMurid(token, m, baru) {
  const user = requireUser_(token, ['ADMIN']);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const semua = readRows_(TAB.MURID);
    const row = normMurid_(m || {}, semua.map(function (r) { return String(r.Kelas); }));
    const ada = semua.find(function (r) { return String(r.NoDaftar).trim() === row[0]; });
    const sh = sheet_(TAB.MURID);
    if (baru) {
      if (ada) throw new Error('No. Daftar ' + row[0] + ' sudah wujud (' + ada.Nama + ').');
      sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues([row]);
    } else {
      if (!ada) throw new Error('Murid tidak dijumpai.');
      sh.getRange(ada._row, 1, 1, 4).setValues([row]);
    }
    log_(user.id, baru ? 'MURID_DITAMBAH' : 'MURID_DIUBAH', row[0]);
  } finally {
    lock.releaseLock();
  }
  return { kelas: senaraiKelas_() };
}

// data = array baris CSV (baris pertama header). kemaskini = true untuk
// kemas kini nama/kelas murid yang No. Daftar sudah wujud; false = langkau.
function importMuridCsv(token, data, kemaskini) {
  const user = requireUser_(token, ['ADMIN']);
  if (!Array.isArray(data) || data.length < 2) throw new Error('Fail kosong atau tiada baris data.');
  if (data.length > 3001) throw new Error('Maksimum 3000 murid sekali import.');
  const col = padanKolum_(data[0]);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(TAB.MURID);
    const values = sh.getDataRange().getValues();
    const head = values.shift();
    const indeks = {};
    values.forEach(function (r, i) { indeks[String(r[0]).trim()] = i; });
    const kelasSedia = values.map(function (r) { return String(r[2]); });

    const hasil = { tambah: 0, kemaskini: 0, langkau: 0, ralat: [] };
    const dalamFail = {};
    data.slice(1).forEach(function (r, i) {
      if (!Array.isArray(r) || r.every(function (v) { return !String(v || '').trim(); })) return;
      const baris = i + 2;
      let row;
      try {
        row = normMurid_({ noDaftar: r[col.noDaftar], nama: r[col.nama], kelas: r[col.kelas] }, kelasSedia);
      } catch (e) {
        hasil.ralat.push('Baris ' + baris + ': ' + e.message);
        return;
      }
      if (dalamFail[row[0]]) {
        hasil.ralat.push('Baris ' + baris + ': No. Daftar ' + row[0] + ' berganda dalam fail (sama dengan baris ' + dalamFail[row[0]] + ').');
        return;
      }
      dalamFail[row[0]] = baris;
      if (row[2] && kelasSedia.indexOf(row[2]) === -1) kelasSedia.push(row[2]);

      if (indeks[row[0]] === undefined) {
        indeks[row[0]] = values.length;
        values.push(row);
        hasil.tambah++;
      } else if (kemaskini) {
        values[indeks[row[0]]] = row;
        hasil.kemaskini++;
      } else {
        hasil.langkau++;
      }
    });

    if (hasil.tambah || hasil.kemaskini) {
      sh.getRange(2, 1, values.length, head.length).setValues(values.map(function (r) {
        return head.map(function (_, j) { return r[j] === undefined ? '' : r[j]; });
      }));
    }
    log_(user.id, 'MURID_DIIMPORT', 'CSV: tambah ' + hasil.tambah + ', kemas kini ' + hasil.kemaskini + ', ralat ' + hasil.ralat.length);
    hasil.kelas = senaraiKelas_();
    return hasil;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Helper sesi & PIN (private) ----------

// Semak token sesi, tamat tempoh, status pengguna dan peranan. Pulangkan objek sesi.
function requireUser_(token, roles, opts) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error(SESI_TAMAT);
  const cache = CacheService.getScriptCache();
  const raw = cache.get('sesi_' + token);
  if (!raw) throw new Error(SESI_TAMAT);
  const s = JSON.parse(raw);
  const now = Date.now();

  function tamat(sebab) {
    cache.remove('sesi_' + token);
    log_(s.id, 'SESI_TAMAT', sebab);
    throw new Error(SESI_TAMAT);
  }
  if (now - s.akhir > CONFIG.SESI_MINIT[s.peranan] * 60000) tamat('Tiada aktiviti');
  if (s.peranan === 'PENGAWAS' && !tetingkapPengawas_().dalam) tamat('Waktu bertugas tamat');

  // Admin mungkin nyahaktif pengguna, tukar peranan atau reset PIN semasa sesi aktif
  const u = cariPengguna_(s.id);
  if (!u || !isAktifPengguna_(u) || String(u.Peranan).trim().toUpperCase() !== s.peranan ||
      String(u.Salt).slice(0, 8) !== s.v) tamat('Akaun diubah');

  if (s.perluTukar && !(opts && opts.bolehTukarPin)) throw new Error('Sila tukar PIN dahulu.');
  if (roles && roles.indexOf(s.peranan) === -1) throw new Error('Akses ditolak.');

  s.akhir = now;
  simpanSesi_(token, s);
  return s;
}

function simpanSesi_(token, s) {
  CacheService.getScriptCache().put('sesi_' + token, JSON.stringify(s), CONFIG.SESI_MINIT[s.peranan] * 60);
}

function tetingkapPengawas_() {
  const t = tetapan_();
  const mula = minitDari_(t.tetingkap_pengawas_mula, 'tetingkap_pengawas_mula');
  const tamat = minitDari_(t.tetingkap_pengawas_tamat, 'tetingkap_pengawas_tamat');
  const now = sekarang_();
  const minitTepat = now.minit + Number(fmt_(now.d, 's')) / 60;
  return {
    dalam: minitTepat >= mula && minitTepat < tamat,
    bakiSaat: Math.max(0, Math.round((tamat - minitTepat) * 60)),
    mula: t.tetingkap_pengawas_mula, tamat: t.tetingkap_pengawas_tamat
  };
}

function pinSalah_(u) {
  const n = (Number(u.Cubaan_Gagal) || 0) + 1;
  if (n >= CONFIG.HAD_CUBAAN) {
    tulisPengguna_(u._row, { Cubaan_Gagal: 0, Dikunci_Hingga: new Date(Date.now() + CONFIG.KUNCI_MINIT * 60000) });
    log_(u.ID_Pengguna, 'LOGIN_GAGAL', 'PIN salah (' + n + '). Akaun dikunci ' + CONFIG.KUNCI_MINIT + ' minit');
  } else {
    tulisPengguna_(u._row, { Cubaan_Gagal: n });
    log_(u.ID_Pengguna, 'LOGIN_GAGAL', 'PIN salah (' + n + ')');
  }
}

function ralatKunci_() {
  return 'Terlalu banyak cubaan. Cuba lagi selepas ' + CONFIG.KUNCI_MINIT + ' minit.';
}

function hashPin_(pin, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty('PIN_PEPPER');
  if (!pepper) throw new Error('Sistem belum disetup. Hubungi admin.');
  let h = pepper + ':' + salt + ':' + pin;
  for (let i = 0; i < CONFIG.ITERASI_HASH; i++) h = sha256_(h + salt);
  return h;
}

function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function pinRawak_() {
  const n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000;
  return ('00000' + n).slice(-6);
}

function semakPinBaru_(pin) {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN mesti 6 digit nombor.');
  if (/^(\d)\1{5}$/.test(pin) || ['123456', '654321', '012345', '123123', '112233'].indexOf(pin) > -1) {
    throw new Error('PIN terlalu mudah diteka. Pilih PIN lain.');
  }
}

// Tambah pengguna dengan ID berturutan ikut peranan dan PIN sementara. Pulangkan {id, pin}.
function tambahPengguna_(nama, peranan) {
  nama = clean_(String(nama || '').replace(/\s+/g, ' ').trim(), 100);
  peranan = String(peranan || '').trim().toUpperCase();
  if (!nama) throw new Error('Nama wajib diisi.');
  if (!PERANAN[peranan]) throw new Error('Peranan mesti PENGAWAS, GURU atau ADMIN.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const awalan = PERANAN[peranan];
    const maks = readRows_(TAB.PENGGUNA).reduce(function (m, u) {
      const id = String(u.ID_Pengguna);
      return id.indexOf(awalan) === 0 ? Math.max(m, Number(id.slice(3)) || 0) : m;
    }, 0);
    const id = awalan + ('00' + (maks + 1)).slice(-3);
    const pin = pinRawak_();
    const salt = Utilities.getUuid();
    penggunaSheet_().appendRow([id, nama, peranan, hashPin_(pin, salt), salt, 'ya', '', 'aktif', 0]);
    log_(penggunaSheet_(), 'PENGGUNA_DITAMBAH', id + ' (' + peranan + ')');
    return { id: id, pin: pin };
  } finally {
    lock.releaseLock();
  }
}

function cariPengguna_(id) {
  id = String(id || '').trim().toUpperCase();
  return readRows_(TAB.PENGGUNA).find(function (u) { return String(u.ID_Pengguna).trim().toUpperCase() === id; });
}

function isAktifPengguna_(u) {
  return String(u.Status).trim().toLowerCase() === 'aktif';
}

function tulisPengguna_(row, obj) {
  const sh = sheet_(TAB.PENGGUNA);
  Object.keys(obj).forEach(function (k) {
    sh.getRange(row, HEADERS.Pengguna.indexOf(k) + 1).setValue(obj[k]);
  });
}

// Siapa yang buat tindakan dari menu Sheet (bukan web app)
function penggunaSheet_() {
  return 'SHEET:' + (Session.getActiveUser().getEmail() || 'editor');
}

function log_(id, tindakan, butiran) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.LOG);
  if (!sh) return;
  sh.appendRow([new Date(), clean_(id, 60), tindakan, clean_(butiran, 300)]);
}

// ---------- Helper data (private) ----------

// Nilai Tetapan dibaca sebagai teks (getDisplayValues) supaya "07:20" tak jadi tarikh 1899
function tetapan_() {
  const t = {};
  TETAPAN_LALAI.forEach(function (r) { t[r[0]] = r[1]; });
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.TETAPAN);
  if (sh) {
    sh.getDataRange().getDisplayValues().slice(1).forEach(function (r) {
      const k = String(r[0]).trim();
      if (k) t[k] = String(r[1]).trim();
    });
  }
  return t;
}

function minitDari_(hhmm, kunci) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('Tetapan ' + kunci + ' tidak sah. Hubungi admin.');
  return Number(m[1]) * 60 + Number(m[2]);
}

function hadTindakan_() {
  return Math.max(1, parseInt(tetapan_().had_tindakan_sebulan, 10) || 3);
}

function senaraiKelas_() {
  const murid = readRows_(TAB.MURID).filter(isAktif_);
  return Array.from(new Set(murid.map(function (m) { return String(m.Kelas); }))).sort();
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Tab ' + name + ' tiada. Jalankan menu Setup dahulu.');
  return sh;
}

function readRows_(name) {
  const values = sheet_(name).getDataRange().getValues();
  const head = values.shift() || [];
  return values.map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
}

function readRekod_() {
  return readRows_(TAB.REKOD).filter(function (r) { return r.ID; }).map(function (r) {
    return {
      id: String(r.ID),
      tarikh: r.Tarikh instanceof Date ? fmt_(r.Tarikh, 'yyyy-MM-dd') : String(r.Tarikh),
      masa: r.Masa instanceof Date ? fmt_(r.Masa, 'HH:mm:ss') : String(r.Masa),
      minit: Number(r.MinitLewat) || 0,
      noDaftar: String(r.NoDaftar),
      nama: String(r.Nama),
      kelas: String(r.Kelas),
      sebab: String(r.Sebab),
      catatan: String(r.Catatan),
      oleh: String(r.DirekodOleh),
      _row: r._row
    };
  });
}

function cariRekod_(id) {
  const r = readRekod_().find(function (x) { return x.id === String(id); });
  if (!r) throw new Error('Rekod tidak dijumpai. Mungkin sudah dipadam.');
  return r;
}

function senaraiSebab_() {
  return tetapan_().sebab_lewat.split(',').map(function (s) { return s.trim(); }).filter(String);
}

function semakSebab_(sebab, catatan) {
  if (senaraiSebab_().indexOf(sebab) === -1) throw new Error('Sebab tidak sah.');
  const c = clean_(catatan, 200);
  if (sebab === SEBAB_LAIN && !c) throw new Error('Sila isi catatan untuk sebab Lain-lain.');
  return c;
}

// Pulangkan [noDaftar, nama, kelas, aktif] yang sudah disemak, atau throw Error
function normMurid_(m, kelasSedia) {
  const noDaftar = String(m.noDaftar == null ? '' : m.noDaftar).trim();
  const nama = String(m.nama == null ? '' : m.nama).replace(/\s+/g, ' ').trim().toUpperCase();
  let kelas = String(m.kelas == null ? '' : m.kelas).replace(/\s+/g, ' ').trim();
  if (!/^[A-Za-z0-9\-\/]{1,30}$/.test(noDaftar)) throw new Error('No. Daftar tidak sah "' + noDaftar + '" (huruf/nombor sahaja, maks 30).');
  if (!nama) throw new Error('Nama wajib diisi.');
  if (!kelas) throw new Error('Kelas wajib diisi.');
  // Guna ejaan kelas sedia ada kalau sama (abaikan huruf besar/kecil)
  const sedia = (kelasSedia || []).find(function (k) { return k.toLowerCase() === kelas.toLowerCase(); });
  if (sedia) kelas = sedia;
  return [clean_(noDaftar, 30), clean_(nama, 150), clean_(kelas, 50), m.aktif === false ? 'TIDAK' : 'YA'];
}

// Cari indeks kolum noDaftar/nama/kelas dalam baris header (ikut CONFIG.APDM_HEADER)
function padanKolum_(headerRow) {
  const head = (headerRow || []).map(function (h) { return String(h).replace(/^﻿/, '').trim().toUpperCase(); });
  const col = {};
  Object.keys(CONFIG.APDM_HEADER).forEach(function (k) {
    const calon = CONFIG.APDM_HEADER[k].map(function (h) { return h.toUpperCase(); });
    col[k] = head.findIndex(function (h) { return calon.indexOf(h) > -1; });
  });
  const hilang = Object.keys(col).filter(function (k) { return col[k] === -1; });
  if (hilang.length) {
    throw new Error('Header tidak dijumpai untuk: ' + hilang.join(', ') +
      '. Header dalam fail: ' + head.join(' | ') +
      '. Guna header NoDaftar, Nama, Kelas (atau tambah nama header dalam CONFIG.APDM_HEADER).');
  }
  return col;
}

function isAktif_(m) {
  const a = String(m.Aktif).trim().toUpperCase();
  return a === '' || a === 'YA' || a === 'TRUE';
}

function pubMurid_(m) {
  return { noDaftar: String(m.NoDaftar), nama: String(m.Nama), kelas: String(m.Kelas) };
}

function pub_(r) {
  const o = Object.assign({}, r);
  delete o._row;
  return o;
}

// Elak formula injection bila ditulis ke Sheets
function clean_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function fmt_(d, pattern) {
  return Utilities.formatDate(d, CONFIG.ZON_WAKTU, pattern);
}

function sekarang_() {
  const d = new Date();
  return {
    d: d,
    tarikh: fmt_(d, 'yyyy-MM-dd'),
    masa: fmt_(d, 'HH:mm:ss'),
    minit: Number(fmt_(d, 'H')) * 60 + Number(fmt_(d, 'm'))
  };
}

// Positif = lewat. Tepat pada had (contoh 07:20) = 0, tidak dikira lewat.
function minitLewat_(minitSekarang) {
  return minitSekarang - minitDari_(tetapan_().had_lewat, 'had_lewat');
}
