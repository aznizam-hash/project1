/**
 * SEMARAK TEPAT — sistem rekod kelewatan murid (backend Google Apps Script)
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
  ZON_WAKTU: 'Asia/Kuala_Lumpur',
  MAKS_HARI_LAPORAN: 366,
  MAKS_IMPORT: 3000,
  SESI_MINIT: { PENGAWAS: 3, GURU: 30, ADMIN: 30 }, // tamat jika tiada aktiviti
  HAD_CUBAAN: 5,             // PIN salah berturut-turut sebelum akaun dikunci
  KUNCI_MINIT: 15,
  ITERASI_HASH: 1000         // SHA-256 diulang supaya PIN 6 digit lebih sukar diteka jika Sheet bocor
};

const TAB = { MURID: 'Murid', REKOD: 'Rekod', PENGGUNA: 'Pengguna', TETAPAN: 'Tetapan', LOG: 'LogAudit' };
const HEADERS = {
  Murid: ['ID_Murid', 'Nama', 'Tingkatan', 'Kelas', 'Status'],
  Rekod: ['ID_Rekod', 'Tarikh', 'Masa_Tiba', 'ID_Murid', 'Kelas', 'ID_Pengguna', 'Sebab', 'Lewat', 'Status',
    'Catatan_Disiplin', 'ID_Disiplin', 'Tarikh_Semakan', 'Dibatalkan', 'ID_Pembatal', 'Tarikh_Batal', 'Catatan_Batal'],
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
const SESI_TAMAT = 'Sesi tamat. Sila log masuk semula.';
const RALAT_LOGIN = 'ID atau PIN tidak sah.';

// ---------- Menu & setup (dijalankan dari Google Sheet) ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Semarak Tepat')
    .addItem('1. Setup tab', 'setupSheets')
    .addItem('2. Tambah pengguna', 'menuTambahPengguna')
    .addItem('3. Reset PIN pengguna', 'menuResetPin')
    .addItem('4. Masukkan murid olok-olok (ujian)', 'menuMuridOlokOlok')
    .addToUi();
}

function setupSheets() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();

  // Tab versi lama (header berbeza) disimpan sebagai arkib, tidak dipadam
  ss.getSheets().forEach(function (sh) {
    const nama = Object.keys(HEADERS).find(function (k) { return k.toUpperCase() === sh.getName().toUpperCase(); });
    if (nama && sh.getLastRow() > 0 && String(sh.getRange(1, 1).getValue()).trim() !== HEADERS[nama][0]) {
      sh.setName(sh.getName().toUpperCase() + '_LAMA');
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

  // Kolum teks supaya Sheets tak tukar jadi tarikh/nombor
  ss.getSheetByName(TAB.MURID).getRange('A:B').setNumberFormat('@');
  ss.getSheetByName(TAB.MURID).getRange('D:E').setNumberFormat('@');
  ss.getSheetByName(TAB.REKOD).getRange('A:I').setNumberFormat('@');
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
  if (sh.getLastRow() > 1) { ui.alert('Tab Murid sudah ada data. Data olok-olok hanya dimasukkan ke tab yang kosong.'); return; }
  const kelas = [[1, 'Amanah'], [2, 'Bestari'], [3, 'Cekal']];
  const rows = [];
  for (let i = 1; i <= 15; i++) {
    const k = kelas[(i - 1) % kelas.length];
    rows.push([idMuridBaru_(i - 1), 'Murid Ujian ' + ('0' + i).slice(-2), k[0], k[1], 'aktif']);
  }
  sh.getRange(2, 1, rows.length, 5).setValues(rows);
  PropertiesService.getScriptProperties().setProperty('MURID_SEQ', String(rows.length));
  ui.alert(rows.length + ' murid olok-olok dimasukkan. Padam semua sebelum import data murid sebenar.');
}

// ---------- Web app ----------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Semarak Tepat')
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
    config: {
      sekolah: CONFIG.NAMA_SEKOLAH,
      waktuLewat: t.had_lewat,
      hadTindakan: hadTindakan_(),
      masaServer: Date.now()  // untuk selaraskan jam paparan dengan jam server
    }
  };
}

// Senarai murid aktif untuk skrin Rekod, dan masa rekod hari ini (semua perekod)
// supaya murid yang sudah direkod tidak direkod dua kali.
function getMuridAktif(token) {
  requireUser_(token);
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const hariIni = {};
  readRekod_().forEach(function (r) {
    if (r.tarikh === today && !r.batal) hariIni[r.idMurid] = { masa: r.masa.slice(0, 5), lewat: r.lewat };
  });
  const murid = readMurid_().filter(function (m) { return m.aktif; })
    .map(function (m) { return { id: m.id, nama: m.nama, kelas: m.label }; })
    .sort(function (a, b) { return a.nama.localeCompare(b.nama); });
  return { murid: murid, hariIni: hariIni };
}

function simpanRekod(token, idMurid, sebab) {
  const user = requireUser_(token);
  idMurid = String(idMurid || '').trim();
  sebab = String(sebab || '').trim();
  if (sebab && senaraiSebab_().indexOf(sebab) === -1) throw new Error('Sebab tidak sah.');
  const m = readMurid_().find(function (x) { return x.id === idMurid && x.aktif; });
  if (!m) throw new Error('Murid tidak dijumpai atau tidak aktif.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = sekarang_();  // masa tiba dicap oleh server, bukan dari pelayar
    const rekod = readRekod_();
    const sudah = rekod.find(function (r) { return r.tarikh === t.tarikh && r.idMurid === idMurid && !r.batal; });
    if (sudah) throw new Error(m.nama + ' sudah direkod hari ini pada ' + sudah.masa.slice(0, 5) + '.');

    const lewat = minitLewat_(t.minit) > 0;
    const id = 'R' + fmt_(t.d, 'yyyyMMddHHmmss') + Utilities.getUuid().slice(0, 4).toUpperCase();
    const row = {
      ID_Rekod: id, Tarikh: t.tarikh, Masa_Tiba: t.masa, ID_Murid: idMurid, Kelas: clean_(m.label, 40),
      ID_Pengguna: user.id, Sebab: sebab, Lewat: lewat ? 'ya' : 'tidak',
      Status: lewat ? 'menunggu semakan' : '', Dibatalkan: 'tidak'
    };
    sheet_(TAB.REKOD).appendRow(HEADERS.Rekod.map(function (h) { return row[h] === undefined ? '' : row[h]; }));
    log_(user.id, 'REKOD_DIBUAT', id + ' ' + idMurid + (lewat ? ' (lewat)' : ' (tidak lewat)'));

    const bulan = t.tarikh.slice(0, 7);
    const kali = lewat ? rekod.filter(function (r) {
      return r.idMurid === idMurid && r.lewat && !r.batal && r.tarikh.slice(0, 7) === bulan;
    }).length + 1 : 0;
    return { nama: m.nama, masa: t.masa.slice(0, 5), lewat: lewat, kaliBulanIni: kali, hadTindakan: hadTindakan_() };
  } finally {
    lock.releaseLock();
  }
}

function getRekodHariIni(token) {
  const user = requireUser_(token);
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const nama = petaNamaMurid_();
  return readRekod_().filter(function (r) {
    return r.tarikh === today && !r.batal && (user.peranan !== 'PENGAWAS' || r.oleh === user.id);
  }).map(function (r) {
    const sendiri = r.oleh === user.id;
    return {
      id: r.id, masa: r.masa.slice(0, 5), nama: nama[r.idMurid] || r.idMurid, idMurid: r.idMurid,
      kelas: r.kelas, sebab: r.sebab, lewat: r.lewat, status: r.status, oleh: r.oleh,
      bolehBatal: sendiri || user.peranan === 'ADMIN',
      perluCatatan: !sendiri && user.peranan === 'ADMIN'
    };
  }).reverse();
}

// Rekod tidak dipadam, cuma ditanda dibatalkan.
// Pengawas dan guru: rekod sendiri pada hari yang sama. Admin: semua rekod, dengan catatan.
function batalRekod(token, idRekod, catatan) {
  const user = requireUser_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const r = readRekod_().find(function (x) { return x.id === String(idRekod); });
    if (!r) throw new Error('Rekod tidak dijumpai.');
    if (r.batal) throw new Error('Rekod ini sudah dibatalkan.');
    const t = sekarang_();
    const sendiri = r.oleh === user.id && r.tarikh === t.tarikh;
    const c = clean_(catatan, 200);
    if (!sendiri) {
      if (user.peranan !== 'ADMIN') throw new Error('Anda hanya boleh membatalkan rekod sendiri pada hari yang sama.');
      if (!c) throw new Error('Sila isi catatan sebab pembatalan.');
    }
    const sh = sheet_(TAB.REKOD);
    const col = HEADERS.Rekod.indexOf('Dibatalkan') + 1;
    sh.getRange(r._row, col, 1, 4).setValues([['ya', user.id, fmt_(t.d, 'yyyy-MM-dd HH:mm:ss'), c]]);
    log_(user.id, 'REKOD_DIBATALKAN', r.id + ' ' + r.idMurid + (c ? ': ' + c : ''));
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
  if (p.dari > p.hingga) throw new Error('Tarikh mula mesti sebelum atau sama dengan tarikh akhir.');
  const hari = (new Date(p.hingga) - new Date(p.dari)) / 86400000 + 1;
  if (hari > CONFIG.MAKS_HARI_LAPORAN) throw new Error('Tempoh maksimum ' + CONFIG.MAKS_HARI_LAPORAN + ' hari.');

  const nama = petaNamaMurid_();
  const had = hadTindakan_();
  const bulan = fmt_(new Date(), 'yyyy-MM');
  const lewat = readRekod_().filter(function (r) { return r.lewat && !r.batal && (!p.kelas || r.kelas === p.kelas); });
  const list = lewat.filter(function (r) { return r.tarikh >= p.dari && r.tarikh <= p.hingga; })
    .sort(function (a, b) { return (a.tarikh + a.masa).localeCompare(b.tarikh + b.masa); });

  function ikutMurid(rows) {
    const m = {};
    rows.forEach(function (r) {
      const o = m[r.idMurid] || (m[r.idMurid] = { id: r.idMurid, nama: nama[r.idMurid] || r.idMurid, kelas: r.kelas, n: 0 });
      o.n++;
    });
    return Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return b.n - a.n || a.nama.localeCompare(b.nama); });
  }
  const kerap = ikutMurid(list);
  const bulanIni = ikutMurid(lewat.filter(function (r) { return r.tarikh.slice(0, 7) === bulan; }))
    .filter(function (m) { return m.n >= had; });

  return {
    dari: p.dari, hingga: p.hingga, had: had, bulan: bulan,
    jumlah: list.length,
    pelajar: kerap.length,
    kerap: kerap.slice(0, 20),
    melepasiHad: bulanIni,
    list: list.map(function (r) {
      return { tarikh: r.tarikh, masa: r.masa.slice(0, 5), idMurid: r.idMurid, nama: nama[r.idMurid] || r.idMurid,
        kelas: r.kelas, sebab: r.sebab, status: r.status, oleh: r.oleh };
    })
  };
}

// ---------- Urus pelajar (admin) ----------

function getSenaraiMurid(token) {
  requireUser_(token, ['ADMIN']);
  return readMurid_().map(function (m) {
    return { id: m.id, nama: m.nama, tingkatan: m.tingkatan, kelas: m.kelas, label: m.label, aktif: m.aktif };
  }).sort(function (a, b) { return a.label.localeCompare(b.label) || a.nama.localeCompare(b.nama); });
}

function tambahMurid(token, input) {
  const user = requireUser_(token, ['ADMIN']);
  input = input || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const semua = readMurid_();
    const m = normMurid_(input.nama, input.tingkatan, input.kelas, semua);
    const sama = semua.find(function (x) { return x.aktif && kunciMurid_(x) === kunciMurid_(m); });
    if (sama) throw new Error(m.nama + ' sudah ada dalam ' + sama.label + ' (' + sama.id + ').');
    const id = idMuridSeterusnya_(semua);
    sheet_(TAB.MURID).appendRow([id, m.nama, m.tingkatan, m.kelas, 'aktif']);
    simpanSeqMurid_(id);
    log_(user.id, 'MURID_DITAMBAH', id);
    return { id: id, nama: m.nama, kelas: m.tingkatan + ' ' + m.kelas, senaraiKelas: senaraiKelas_() };
  } finally {
    lock.releaseLock();
  }
}

function tukarStatusMurid(token, idMurid, aktif) {
  const user = requireUser_(token, ['ADMIN']);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const m = readMurid_().find(function (x) { return x.id === String(idMurid); });
    if (!m) throw new Error('Murid tidak dijumpai.');
    sheet_(TAB.MURID).getRange(m._row, 5).setValue(aktif ? 'aktif' : 'tidak aktif');
    log_(user.id, 'MURID_STATUS', m.id + ' -> ' + (aktif ? 'aktif' : 'tidak aktif'));
    return { senaraiKelas: senaraiKelas_() };
  } finally {
    lock.releaseLock();
  }
}

// Langkah 1 import: semak sahaja, tiada apa disimpan
function semakImportMurid(token, data) {
  requireUser_(token, ['ADMIN']);
  const p = rancangImport_(data, readMurid_());
  return { ralat: p.ralat, baru: p.baru.length, kekal: p.kekal, aktifSemula: p.aktifSemula.length,
    tidakAktif: p.tidakAktif.length, contohTidakAktif: p.tidakAktif.slice(0, 10).map(function (m) { return m.nama + ' (' + m.label + ')'; }),
    amaran: p.amaran };
}

// Langkah 2 import: semak semula, backup tab Murid, kemudian simpan semua atau tiada langsung
function simpanImportMurid(token, data) {
  const user = requireUser_(token, ['ADMIN']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const semua = readMurid_();
    const p = rancangImport_(data, semua);
    if (p.ralat.length) throw new Error('Fail masih ada ' + p.ralat.length + ' ralat. Tiada apa disimpan.');

    const ss = SpreadsheetApp.getActive();
    const namaBackup = 'Murid_backup_' + fmt_(new Date(), 'yyyyMMdd_HHmmss');
    sheet_(TAB.MURID).copyTo(ss).setName(namaBackup);

    // Kemas kini lajur Status sekali gus (lebih laju daripada satu sel satu panggilan)
    const sh = sheet_(TAB.MURID);
    if (semua.length) {
      const status = sh.getRange(2, 5, sh.getLastRow() - 1, 1).getValues();
      p.aktifSemula.forEach(function (m) { status[m._row - 2][0] = 'aktif'; });
      p.tidakAktif.forEach(function (m) { status[m._row - 2][0] = 'tidak aktif'; });
      sh.getRange(2, 5, status.length, 1).setValues(status);
    }
    let seq = seqMurid_(semua);
    const rows = p.baru.map(function (m) { return [idMuridBaru_(seq++), m.nama, m.tingkatan, m.kelas, 'aktif']; });
    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
      simpanSeqMurid_(rows[rows.length - 1][0]);
    }
    log_(user.id, 'MURID_DIIMPORT', 'Baru ' + rows.length + ', kekal ' + p.kekal + ', aktif semula ' + p.aktifSemula.length +
      ', tidak aktif ' + p.tidakAktif.length + '. Backup: ' + namaBackup);
    return { baru: rows.length, kekal: p.kekal, aktifSemula: p.aktifSemula.length, tidakAktif: p.tidakAktif.length,
      backup: namaBackup, senaraiKelas: senaraiKelas_() };
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


// ---------- Helper murid & rekod (private) ----------

function readMurid_() {
  return readRows_(TAB.MURID).filter(function (r) { return String(r.ID_Murid).trim(); }).map(function (r) {
    const ting = String(r.Tingkatan).trim();
    const kelas = String(r.Kelas).trim();
    return {
      id: String(r.ID_Murid).trim(), nama: String(r.Nama).trim(), tingkatan: ting, kelas: kelas,
      label: ting + ' ' + kelas, aktif: String(r.Status).trim().toLowerCase() !== 'tidak aktif', _row: r._row
    };
  });
}

function readRekod_() {
  return readRows_(TAB.REKOD).filter(function (r) { return r.ID_Rekod; }).map(function (r) {
    return {
      id: String(r.ID_Rekod),
      tarikh: r.Tarikh instanceof Date ? fmt_(r.Tarikh, 'yyyy-MM-dd') : String(r.Tarikh),
      masa: r.Masa_Tiba instanceof Date ? fmt_(r.Masa_Tiba, 'HH:mm:ss') : String(r.Masa_Tiba),
      idMurid: String(r.ID_Murid),
      kelas: String(r.Kelas),
      oleh: String(r.ID_Pengguna),
      sebab: String(r.Sebab),
      lewat: String(r.Lewat).trim().toLowerCase() === 'ya',
      status: String(r.Status),
      batal: String(r.Dibatalkan).trim().toLowerCase() === 'ya',
      _row: r._row
    };
  });
}

function petaNamaMurid_() {
  const p = {};
  readMurid_().forEach(function (m) { p[m.id] = m.nama; });
  return p;
}

function senaraiKelas_() {
  const set = {};
  readMurid_().forEach(function (m) { if (m.aktif) set[m.label] = [Number(m.tingkatan), m.kelas]; });
  return Object.keys(set).sort(function (a, b) { return set[a][0] - set[b][0] || set[a][1].localeCompare(set[b][1]); });
}

function senaraiSebab_() {
  return tetapan_().sebab_lewat.split(',').map(function (s) { return s.trim(); }).filter(String);
}

// Semak dan kemaskan satu murid. Ejaan kelas diselaraskan dengan kelas sedia ada.
function normMurid_(nama, tingkatan, kelas, semua) {
  nama = String(nama == null ? '' : nama).replace(/\s+/g, ' ').trim();
  kelas = String(kelas == null ? '' : kelas).replace(/\s+/g, ' ').trim();
  const t = String(tingkatan == null ? '' : tingkatan).trim();
  if (!nama) throw new Error('Nama wajib diisi.');
  if (nama.length > 150) throw new Error('Nama terlalu panjang (maks 150 aksara).');
  if (!/^[1-5]$/.test(t)) throw new Error('Tingkatan mesti 1 hingga 5.');
  if (!kelas) throw new Error('Kelas wajib diisi.');
  if (kelas.length > 30) throw new Error('Nama kelas terlalu panjang (maks 30 aksara).');
  const sedia = (semua || []).find(function (m) { return m.kelas.toLowerCase() === kelas.toLowerCase(); });
  if (sedia) kelas = sedia.kelas;
  return { nama: clean_(nama, 150), tingkatan: Number(t), kelas: clean_(kelas, 30) };
}

function kunciMurid_(m) {
  return String(m.nama).toUpperCase() + '|' + m.tingkatan + '|' + String(m.kelas).toUpperCase();
}

// Rancang import CSV tanpa menulis apa-apa. data = array baris, baris pertama header.
function rancangImport_(data, semua) {
  if (!Array.isArray(data) || data.length < 2) throw new Error('Fail kosong atau tiada baris data.');
  if (data.length > CONFIG.MAKS_IMPORT + 1) throw new Error('Maksimum ' + CONFIG.MAKS_IMPORT + ' murid sekali import.');
  const head = (data[0] || []).map(function (h) { return String(h).replace(/^﻿/, '').trim().toUpperCase(); });
  const col = { nama: head.indexOf('NAMA'), tingkatan: head.indexOf('TINGKATAN'), kelas: head.indexOf('KELAS') };
  const hilang = Object.keys(col).filter(function (k) { return col[k] === -1; });
  if (hilang.length) throw new Error('Lajur tidak dijumpai: ' + hilang.join(', ') + '. Baris pertama mesti Nama, Tingkatan, Kelas.');

  const indeks = {};
  semua.forEach(function (m) { (indeks[kunciMurid_(m)] = indeks[kunciMurid_(m)] || []).push(m); });

  const p = { ralat: [], baru: [], kekal: 0, aktifSemula: [], tidakAktif: [], amaran: '' };
  const dalamFail = {};
  const dipadan = {};
  data.slice(1).forEach(function (r, i) {
    if (!Array.isArray(r) || r.every(function (v) { return !String(v == null ? '' : v).trim(); })) return;
    const baris = i + 2;
    let m;
    try {
      m = normMurid_(r[col.nama], r[col.tingkatan], r[col.kelas], semua);
    } catch (e) {
      p.ralat.push('Baris ' + baris + ': ' + e.message);
      return;
    }
    const k = kunciMurid_(m);
    if (dalamFail[k]) {
      p.ralat.push('Baris ' + baris + ': ' + m.nama + ' (' + m.tingkatan + ' ' + m.kelas + ') berganda dengan baris ' + dalamFail[k] + '.');
      return;
    }
    dalamFail[k] = baris;
    const padan = indeks[k] || [];
    if (padan.length > 1) {
      p.ralat.push('Baris ' + baris + ': ada ' + padan.length + ' murid bernama ' + m.nama + ' dalam ' + m.tingkatan + ' ' + m.kelas +
        ' (' + padan.map(function (x) { return x.id; }).join(', ') + '). Betulkan dalam tab Murid dahulu.');
      return;
    }
    if (padan.length === 1) {
      dipadan[padan[0].id] = true;
      if (padan[0].aktif) p.kekal++;
      else p.aktifSemula.push(padan[0]);
    } else {
      p.baru.push(m);
    }
  });

  p.tidakAktif = semua.filter(function (m) { return m.aktif && !dipadan[m.id]; });
  const aktif = semua.filter(function (m) { return m.aktif; }).length;
  if (aktif >= 20 && p.tidakAktif.length > aktif / 2) {
    p.amaran = p.tidakAktif.length + ' daripada ' + aktif + ' murid aktif akan jadi tidak aktif. ' +
      'Pastikan fail ini senarai penuh semua kelas, bukan satu kelas sahaja.';
  }
  return p;
}

// ID murid tidak pernah digunakan semula: nombor seterusnya diambil daripada
// nilai terbesar antara tab Murid dan kaunter dalam Script Properties.
function seqMurid_(semua) {
  const maksSheet = semua.reduce(function (m, x) { return Math.max(m, Number(String(x.id).slice(3)) || 0); }, 0);
  const prop = Number(PropertiesService.getScriptProperties().getProperty('MURID_SEQ')) || 0;
  return Math.max(maksSheet, prop);
}

function idMuridSeterusnya_(semua) {
  return idMuridBaru_(seqMurid_(semua));
}

function idMuridBaru_(seq) {
  return 'MUR' + String(seq + 1).padStart(4, '0');
}

function simpanSeqMurid_(id) {
  PropertiesService.getScriptProperties().setProperty('MURID_SEQ', String(Number(String(id).slice(3)) || 0));
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
