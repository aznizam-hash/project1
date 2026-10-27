/**
 * SMART LATE RECORD — backend Google Apps Script
 * Script ini mesti dibuka dari Google Sheet (Extensions > Apps Script).
 *
 * Nota: function yang namanya berakhir dengan "_" ialah private dan tidak
 * boleh dipanggil dari browser. Function lain semua boleh dipanggil melalui
 * google.script.run, jadi setiap satu mesti semak pengguna dulu.
 */

const CONFIG = {
  NAMA_SEKOLAH: 'NAMA SEKOLAH ANDA',
  KOD_SEKOLAH: 'KOD SEKOLAH',
  LOGO_URL: '',              // pilihan: URL imej logo (kosongkan kalau tiada)
  WAKTU_LEWAT: '07:20',      // mula dikira lewat
  ZON_WAKTU: 'Asia/Kuala_Lumpur',
  HAD_KERAP: 3,              // lewat N kali sebulan = ditanda kerap
  MAKS_HARI_LAPORAN: 366,
  // Nama header dalam fail APDM yang diterima (huruf besar/kecil tak penting).
  // Tambah nama lain kalau header fail APDM sekolah berbeza.
  APDM_HEADER: {
    noDaftar: ['NO. DAFTAR', 'NO DAFTAR', 'NO. PENDAFTARAN', 'NO PENDAFTARAN', 'ID MURID', 'NO. MURID'],
    nama: ['NAMA', 'NAMA MURID'],
    kelas: ['KELAS', 'NAMA KELAS']
  }
};

const TAB = { MURID: 'MURID', PENGGUNA: 'PENGGUNA', SEBAB: 'SEBAB', REKOD: 'REKOD', IMPORT: 'IMPORT_APDM' };
const HEADERS = {
  MURID: ['NoDaftar', 'Nama', 'Kelas', 'Aktif'],
  PENGGUNA: ['Email', 'Nama', 'Peranan'],
  SEBAB: ['Sebab'],
  REKOD: ['ID', 'Timestamp', 'Tarikh', 'Masa', 'MinitLewat', 'NoDaftar', 'Nama', 'Kelas', 'Sebab', 'Catatan', 'DirekodOleh']
};
const SEBAB_LAIN = 'Lain-lain';
const SEBAB_LALAI = ['Bangun lewat', 'Kenderaan rosak / lewat', 'Hujan / banjir', 'Hal keluarga', 'Sakit / temujanji klinik', SEBAB_LAIN];

// ---------- Menu & setup (dijalankan dari Google Sheet) ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Smart Late Record')
    .addItem('1. Setup tab', 'setupSheets')
    .addItem('2. Import data murid (APDM)', 'importApdm')
    .addToUi();
}

function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  const pengguna = ss.getSheetByName(TAB.PENGGUNA);
  if (pengguna && pengguna.getLastRow() > 1) requireUser_(['ADMIN']);

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
  ss.setSpreadsheetTimeZone(CONFIG.ZON_WAKTU);

  const sebab = ss.getSheetByName(TAB.SEBAB);
  if (sebab.getLastRow() === 1) {
    sebab.getRange(2, 1, SEBAB_LALAI.length, 1).setValues(SEBAB_LALAI.map(function (s) { return [s]; }));
  }
  const p = ss.getSheetByName(TAB.PENGGUNA);
  const me = Session.getActiveUser().getEmail();
  if (p.getLastRow() === 1 && me) p.appendRow([me, 'Admin', 'ADMIN']);

  SpreadsheetApp.getUi().alert('Setup selesai. Tambah pengguna dalam tab PENGGUNA dan import data murid.');
}

function importApdm() {
  requireUser_(['ADMIN']);
  const ui = SpreadsheetApp.getUi();
  const sh = sheet_(TAB.IMPORT);
  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) {
    ui.alert('Tab IMPORT_APDM kosong. Paste data APDM (termasuk baris header) dahulu.');
    return;
  }

  const head = values[0].map(function (h) { return String(h).trim().toUpperCase(); });
  const col = {};
  Object.keys(CONFIG.APDM_HEADER).forEach(function (k) {
    const calon = CONFIG.APDM_HEADER[k].map(function (h) { return h.toUpperCase(); });
    col[k] = head.findIndex(function (h) { return calon.indexOf(h) > -1; });
  });
  const hilang = Object.keys(col).filter(function (k) { return col[k] === -1; });
  if (hilang.length) {
    ui.alert('Header tidak dijumpai untuk: ' + hilang.join(', ') +
      '\n\nHeader dalam fail: ' + head.join(' | ') +
      '\n\nTambah nama header yang betul dalam CONFIG.APDM_HEADER.');
    return;
  }

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
  ui.alert('Selesai. ' + rows.length + ' murid diimport. Tab IMPORT_APDM telah dikosongkan.');
}

// ---------- Web app ----------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Smart Late Record')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getInit() {
  const user = requireUser_();
  const murid = readRows_(TAB.MURID).filter(isAktif_);
  const kelas = Array.from(new Set(murid.map(function (m) { return String(m.Kelas); }))).sort();
  return {
    user: user,
    kelas: kelas,
    sebab: senaraiSebab_(),
    sebabLain: SEBAB_LAIN,
    config: {
      sekolah: CONFIG.NAMA_SEKOLAH,
      kod: CONFIG.KOD_SEKOLAH,
      logo: CONFIG.LOGO_URL,
      waktuLewat: CONFIG.WAKTU_LEWAT,
      hadKerap: CONFIG.HAD_KERAP
    }
  };
}

function getMuridKelas(kelas) {
  requireUser_();
  return readRows_(TAB.MURID)
    .filter(function (m) { return isAktif_(m) && String(m.Kelas) === String(kelas); })
    .map(pubMurid_)
    .sort(function (a, b) { return a.nama.localeCompare(b.nama); });
}

function cariMurid(q) {
  requireUser_();
  q = String(q || '').trim().toLowerCase();
  if (q.length < 3) return [];
  return readRows_(TAB.MURID)
    .filter(function (m) { return isAktif_(m) && String(m.Nama).toLowerCase().indexOf(q) > -1; })
    .slice(0, 20)
    .map(pubMurid_);
}

function simpanRekod(input) {
  const user = requireUser_();
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
    if (lewat < 0) amaran.push('Sekarang ' + t.masa.slice(0, 5) + ', belum waktu lewat (' + CONFIG.WAKTU_LEWAT + ').');
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
        clean_(m.NoDaftar, 30), clean_(m.Nama, 150), clean_(m.Kelas, 50), sebab, catatan, user.email];
    });
    const sh = sheet_(TAB.REKOD);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    const bulan = t.tarikh.slice(0, 7);
    const disimpan = ids.map(function (id) {
      const kali = rekod.filter(function (r) { return r.noDaftar === id && r.tarikh.slice(0, 7) === bulan; }).length + 1;
      return { nama: String(muridMap[id].Nama), kelas: String(muridMap[id].Kelas), kaliBulanIni: kali, kerap: kali >= CONFIG.HAD_KERAP };
    });
    return { ok: true, disimpan: disimpan, minitLewat: minit };
  } finally {
    lock.releaseLock();
  }
}

function getRekodHariIni() {
  const user = requireUser_();
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const list = readRekod_().filter(function (r) { return r.tarikh === today; }).map(pub_).reverse();
  return { list: list, bolehUbah: user.peranan === 'ADMIN' };
}

function kemaskiniRekod(id, sebab, catatan) {
  requireUser_(['ADMIN']);
  const c = semakSebab_(String(sebab || '').trim(), catatan);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const r = cariRekod_(id);
    sheet_(TAB.REKOD).getRange(r._row, 9, 1, 2).setValues([[sebab, c]]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function padamRekod(id) {
  requireUser_(['ADMIN']);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_(TAB.REKOD).deleteRow(cariRekod_(id)._row);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function getLaporan(p) {
  requireUser_(['ADMIN']);
  p = p || {};
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(p.dari) || !re.test(p.hingga)) throw new Error('Tarikh tidak sah.');
  if (p.dari > p.hingga) throw new Error('Tarikh "Dari" mesti sebelum atau sama dengan "Hingga".');
  const hari = (new Date(p.hingga) - new Date(p.dari)) / 86400000 + 1;
  if (hari > CONFIG.MAKS_HARI_LAPORAN) throw new Error('Tempoh maksimum ' + CONFIG.MAKS_HARI_LAPORAN + ' hari.');
  const had = Math.max(1, parseInt(p.had, 10) || CONFIG.HAD_KERAP);

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

function getSenaraiMurid() {
  requireUser_(['ADMIN']);
  return readRows_(TAB.MURID).filter(function (m) { return String(m.NoDaftar).trim(); })
    .map(function (m) {
      const o = pubMurid_(m);
      o.aktif = isAktif_(m);
      return o;
    })
    .sort(function (a, b) { return a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama); });
}

// baru = true untuk tambah murid; false untuk edit murid sedia ada (ikut noDaftar)
function simpanMurid(m, baru) {
  requireUser_(['ADMIN']);
  m = m || {};
  const noDaftar = String(m.noDaftar || '').trim();
  const nama = String(m.nama || '').replace(/\s+/g, ' ').trim().toUpperCase();
  let kelas = String(m.kelas || '').replace(/\s+/g, ' ').trim();
  if (!/^[A-Za-z0-9\-\/]{1,30}$/.test(noDaftar)) throw new Error('No. Daftar tidak sah (huruf/nombor sahaja, maks 30).');
  if (!nama) throw new Error('Nama wajib diisi.');
  if (!kelas) throw new Error('Kelas wajib diisi.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const semua = readRows_(TAB.MURID);
    // Guna ejaan kelas sedia ada kalau sama (abaikan huruf besar/kecil)
    const sedia = semua.map(function (r) { return String(r.Kelas); })
      .find(function (k) { return k.toLowerCase() === kelas.toLowerCase(); });
    if (sedia) kelas = sedia;

    const ada = semua.find(function (r) { return String(r.NoDaftar).trim() === noDaftar; });
    const sh = sheet_(TAB.MURID);
    const row = [clean_(noDaftar, 30), clean_(nama, 150), clean_(kelas, 50), m.aktif === false ? 'TIDAK' : 'YA'];
    if (baru) {
      if (ada) throw new Error('No. Daftar ' + noDaftar + ' sudah wujud (' + ada.Nama + ').');
      sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues([row]);
    } else {
      if (!ada) throw new Error('Murid tidak dijumpai.');
      sh.getRange(ada._row, 1, 1, 4).setValues([row]);
    }
  } finally {
    lock.releaseLock();
  }
  return { kelas: getInit().kelas };
}

// ---------- Helper (private) ----------

function requireUser_(roles) {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw new Error('Tidak dapat kenal pasti akaun. Sila log masuk dengan akaun DELIMa.');
  const u = readRows_(TAB.PENGGUNA).find(function (r) { return String(r.Email).trim().toLowerCase() === email; });
  if (!u) throw new Error('Tiada akses untuk ' + email + '. Hubungi admin sistem.');
  const peranan = String(u.Peranan).trim().toUpperCase();
  if (roles && roles.indexOf(peranan) === -1) throw new Error('Akses ditolak untuk peranan ' + peranan + '.');
  return { email: email, nama: String(u.Nama || email), peranan: peranan };
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
  return readRows_(TAB.SEBAB).map(function (r) { return String(r.Sebab).trim(); }).filter(String);
}

function semakSebab_(sebab, catatan) {
  if (senaraiSebab_().indexOf(sebab) === -1) throw new Error('Sebab tidak sah.');
  const c = clean_(catatan, 200);
  if (sebab === SEBAB_LAIN && !c) throw new Error('Sila isi catatan untuk sebab Lain-lain.');
  return c;
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

function minitLewat_(minitSekarang) {
  const p = CONFIG.WAKTU_LEWAT.split(':').map(Number);
  return minitSekarang - (p[0] * 60 + p[1]);
}
