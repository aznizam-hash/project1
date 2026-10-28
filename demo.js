/**
 * MOD DEMO — untuk cuba UI di GitHub Pages tanpa Google Sheets.
 * Code.gs sebenar dimuatkan dan dijalankan dalam browser. SpreadsheetApp,
 * CacheService dan lain-lain diganti dengan versi tiruan yang simpan data dalam
 * localStorage. Semua nama murid ialah rekaan.
 * Fail ini tidak perlu dimasukkan ke Apps Script.
 */
(function () {
  const KEY = 'slr-demo-v3';
  const TZ = 'Asia/Kuala_Lumpur';
  const PIN_DEMO = '246810';
  const AKAUN = [
    ['ADM001', 'Cikgu Admin Demo', 'ADMIN', 'tidak'],
    ['GRU001', 'Cikgu Disiplin Demo', 'GURU', 'tidak'],
    ['PGW001', 'Pengawas Demo', 'PENGAWAS', 'tidak'],
    ['PGW002', 'Pengawas Baru Demo', 'PENGAWAS', 'ya'] // untuk cuba skrin tukar PIN
  ];

  function store(get, val) {
    try {
      if (get) return localStorage.getItem(val);
      localStorage.setItem(val[0], val[1]);
    } catch (e) { return null; }
  }

  // ---------- Data contoh ----------
  function seed() {
    const kelas = [[1, 'Amanah'], [2, 'Bestari'], [3, 'Cemerlang'], [4, 'Dinamik'], [5, 'Elit']];
    const nama = ['Ahmad bin Ali', 'Siti Hajar binti Rahman', 'Muhammad Irfan bin Hassan', 'Tan Mei Ling',
      'Arjun a/l Suresh', 'Nur Aisyah binti Kamal', 'Daniel bin Ismail', 'Farah binti Yusof',
      'Hafiz bin Osman', 'Lim Wei Jie', 'Sofea binti Zulkifli', 'Priya a/p Ramesh',
      'Aiman bin Rosli', 'Nabila binti Hamid', 'Haziq bin Salleh', 'Chong Kai Xuan',
      'Aina binti Mahmud', 'Amirul bin Razak', 'Wong Jia Hui', 'Iman binti Karim',
      'Zarif bin Fauzi', 'Kavitha a/p Muthu', 'Adam bin Hakim', 'Balqis binti Aziz',
      'Ong Zhi Hao', 'Syafiq bin Latif', 'Alya binti Nordin', 'Rizal bin Jaafar',
      'Deepa a/p Kumar', 'Haris bin Sufian', 'Qistina binti Rashid', 'Ng Yi Xin',
      'Faris bin Ahmad', 'Humaira binti Saad', 'Luqman bin Hashim', 'Ravi a/l Ganesan',
      'Insyirah binti Halim', 'Danish bin Effendi', 'Lee Shu Ting', 'Hakimi bin Rahim'];
    const murid = [['ID_Murid', 'Nama', 'Tingkatan', 'Kelas', 'Status']];
    nama.forEach((nm, i) => {
      const k = kelas[Math.floor(i / 8)];
      murid.push(['MUR' + String(i + 1).padStart(4, '0'), nm, k[0], k[1], 'aktif']);
    });
    const sebab = ['Masalah kenderaan', 'Bangun lewat', 'Hujan lebat', 'Urusan keluarga', 'Lain-lain'];
    const rekod = [['ID_Rekod', 'Tarikh', 'Masa_Tiba', 'ID_Murid', 'Kelas', 'ID_Pengguna', 'Sebab', 'Lewat', 'Status',
      'Catatan_Disiplin', 'ID_Disiplin', 'Tarikh_Semakan', 'Dibatalkan', 'ID_Pembatal', 'Tarikh_Batal', 'Catatan_Batal']];
    // Rekod rekaan untuk 45 hari lepas (hari bekerja sahaja)
    let r = 7;
    const rand = m => { r = (r * 9301 + 49297) % 233280; return Math.floor(r / 233280 * m); };
    for (let d = 45; d >= 1; d--) {
      const t = new Date(Date.now() - d * 86400000);
      if (Number(fmt(t, 'u')) > 5) continue;
      const bil = rand(5);
      const ada = {};
      for (let j = 0; j < bil; j++) {
        const m = murid[1 + (j === 0 ? rand(6) : rand(murid.length - 1))]; // beberapa murid jadi "kerap"
        if (ada[m[0]]) continue;
        ada[m[0]] = true;
        const minit = 21 + rand(39);
        const masa = '07:' + String(minit).padStart(2, '0') + ':' + String(rand(60)).padStart(2, '0');
        rekod.push(['RDEMO' + d + '-' + j, fmt(t, 'yyyy-MM-dd'), masa, m[0], m[2] + ' ' + m[3], 'PGW001',
          rand(3) ? sebab[rand(sebab.length)] : '', 'ya', 'menunggu semakan', '', '', '', 'tidak', '', '', '']);
      }
    }
    return {
      Murid: murid,
      Rekod: rekod,
      Pengguna: [['ID_Pengguna', 'Nama', 'Peranan', 'Hash_PIN', 'Salt', 'Perlu_Tukar_PIN', 'Dikunci_Hingga', 'Status', 'Cubaan_Gagal']],
      Tetapan: [['Kunci', 'Nilai', 'Keterangan'],
        // Demo sahaja: tetingkap pengawas sepanjang hari supaya boleh dicuba bila-bila masa
        ['tetingkap_pengawas_mula', '00:00', ''],
        ['tetingkap_pengawas_tamat', '23:59', ''],
        ['had_lewat', '07:20', ''],
        ['had_tindakan_sebulan', '3', ''],
        ['sebab_lewat', sebab.join(', '), '']],
      LogAudit: [['Masa', 'ID_Pengguna', 'Tindakan', 'Butiran']]
    };
  }

  function fmt(d, pattern) {
    const p = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23'
    }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
    const map = {
      yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second,
      H: String(Number(p.hour)), m: String(Number(p.minute)), s: String(Number(p.second)),
      u: String({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday])
    };
    return pattern.replace(/yyyy|MM|dd|HH|mm|ss|H|m|s|u/g, t => map[t]);
  }

  // SHA-256 ringkas (browser tiada versi synchronous). Pulangkan array byte.
  function sha256(bytes) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const len = bytes.length;
    const total = Math.ceil((len + 9) / 64) * 64;
    const m = new Uint8Array(total);
    m.set(bytes); m[len] = 0x80;
    const bits = len * 8;
    m[total - 4] = bits >>> 24; m[total - 3] = bits >>> 16; m[total - 2] = bits >>> 8; m[total - 1] = bits;
    const w = new Uint32Array(64);
    const rot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < total; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, h].forEach((x, i) => { H[i] = (H[i] + x) | 0; });
    }
    const out = [];
    H.forEach(x => out.push(x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255));
    return out.map(b => (b > 127 ? b - 256 : b)); // byte bertanda macam Apps Script
  }

  let db;
  try { db = JSON.parse(store(true, KEY)); } catch (e) { db = null; }
  if (!db || !db.Pengguna) db = seed();
  const save = () => store(false, [KEY, JSON.stringify(db)]);
  save();

  // ---------- Pengganti API Google ----------
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const keluar = x => (typeof x === 'string' && ISO.test(x) ? new Date(x) : x);
  function sheet(name) {
    const rows = db[name];
    const tulis = (r, c, v) => {
      v.forEach((row, i) => {
        rows[r - 1 + i] = rows[r - 1 + i] || [];
        row.forEach((x, j) => {
          // Macam Google Sheets: awalan ' (paksa teks) tidak disimpan sebagai sebahagian nilai
          rows[r - 1 + i][c - 1 + j] = x instanceof Date ? x.toISOString() : (typeof x === 'string' ? x.replace(/^'/, '') : x);
        });
      });
      save();
    };
    return {
      getDataRange: () => ({
        getValues: () => rows.map(r => r.map(keluar)),
        getDisplayValues: () => rows.map(r => r.map(x => String(x == null ? '' : x)))
      }),
      getLastRow: () => rows.length,
      getRange: (r, c, nr, nc) => ({
        setValues: v => tulis(r, c, v), setValue: v => tulis(r, c, [[v]]), setNumberFormat() {},
        getValues: () => rows.slice(r - 1, r - 1 + (nr || 1)).map(x => x.slice(c - 1, c - 1 + (nc || 1)).map(keluar))
      }),
      copyTo: () => ({ setName: n => { db[n] = rows.map(x => x.slice()); save(); } }),
      appendRow: row => tulis(rows.length + 1, 1, [row]),
      deleteRow: r => { rows.splice(r - 1, 1); save(); }
    };
  }
  window.SpreadsheetApp = { getActive: () => ({ getSheetByName: n => (db[n] ? sheet(n) : null) }) };
  window.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
  window.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  // Cache dalam memori sahaja: refresh halaman = sesi hilang, sama macam web app sebenar
  const cache = {};
  window.CacheService = {
    getScriptCache: () => ({
      get: k => (cache[k] && cache[k].tamat > Date.now() ? cache[k].v : null),
      put: (k, v, saat) => { cache[k] = { v: v, tamat: Date.now() + (saat || 600) * 1000 }; },
      remove: k => { delete cache[k]; }
    })
  };
  const props = { PIN_PEPPER: 'demo-pepper' };
  window.PropertiesService = {
    getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } })
  };
  const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  window.Utilities = {
    getUuid: () => { const h = hex(); return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-'); },
    formatDate: (d, tz, p) => fmt(d, p),
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (alg, s) => sha256(new TextEncoder().encode(s))
  };

  // google.script.run tiruan: panggil function Code.gs secara async
  function runner(ok, fail) {
    return new Proxy({}, {
      get(_, name) {
        if (name === 'withSuccessHandler') return f => runner(f, fail);
        if (name === 'withFailureHandler') return f => runner(ok, f);
        return (...args) => setTimeout(() => {
          try {
            const fn = window[name];
            if (typeof fn !== 'function' || name.endsWith('_')) throw new Error('Function tidak wujud: ' + name);
            const res = fn(...JSON.parse(JSON.stringify(args)));
            ok && ok(res === undefined ? null : JSON.parse(JSON.stringify(res)));
          } catch (e) { fail ? fail(e) : console.error(e); }
        }, 250);
      }
    });
  }
  window.google = { script: { run: runner() } };

  // ---------- Banner demo ----------
  const bar = document.getElementById('banner');
  bar.innerHTML = '<span><b>Mod demo.</b> Data rekaan, disimpan dalam pelayar ini sahaja dan tidak dihantar ke mana-mana. ' +
    'Akaun: ADM001, GRU001, PGW001, PGW002 (perlu tukar PIN). PIN semua: ' + PIN_DEMO + '.</span>' +
    '<button id="demoReset">Reset data</button>';
  bar.hidden = false;
  document.getElementById('demoReset').addEventListener('click', () => {
    if (!confirm('Padam semua data demo dan mula semula?')) return;
    db = seed(); save(); location.reload();
  });

  // ---------- Muat Code.gs sebenar ----------
  fetch('Code.gs', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('Gagal muat Code.gs'); return r.text(); })
    .then(src => {
      // Function dalam Code.gs jadi global; const kekal dalam skop eval
      (0, eval)(src + '\n;window.__slr = true;');
      if (db.Pengguna.length === 1) {
        AKAUN.forEach(a => {
          const salt = Utilities.getUuid();
          db.Pengguna.push([a[0], a[1], a[2], hashPin_(PIN_DEMO, salt), salt, a[3], '', 'aktif', 0]);
        });
        save();
      }
      tunjukLogin();
    })
    .catch(e => { document.getElementById('loading').textContent = e.message; });
})();
