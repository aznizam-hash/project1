/**
 * MOD DEMO — untuk cuba UI di GitHub Pages tanpa Google Sheets.
 * Code.gs sebenar dimuatkan dan dijalankan dalam browser. SpreadsheetApp,
 * Session dan lain-lain diganti dengan versi tiruan yang simpan data dalam
 * localStorage. Semua nama murid ialah rekaan.
 * Fail ini tidak perlu dimasukkan ke Apps Script.
 */
(function () {
  const KEY = 'slr-demo-v1';
  const ROLE_KEY = 'slr-demo-role';
  const EMAIL = { ADMIN: 'admin.demo@moe-dl.edu.my', PENGAWAS: 'pengawas.demo@moe-dl.edu.my' };
  const TZ = 'Asia/Kuala_Lumpur';

  function store(get, val) {
    try {
      if (get) return localStorage.getItem(val);
      localStorage.setItem(val[0], val[1]);
    } catch (e) { return null; }
  }

  // ---------- Data contoh ----------
  function seed() {
    const kelas = ['1 Amanah', '2 Bestari', '3 Cemerlang', '4 Dinamik', '5 Elit'];
    const depan = ['Ahmad', 'Nur', 'Muhammad', 'Siti', 'Daniel', 'Aisyah', 'Hafiz', 'Mei Ling', 'Arjun', 'Farah'];
    const belakang = ['Hakimi', 'Aina', 'Irfan', 'Hajar', 'Lim', 'Sofea', 'Zulkifli', 'Tan', 'Kumar', 'Nabila'];
    const murid = [['NoDaftar', 'Nama', 'Kelas', 'Aktif']];
    let n = 1001;
    kelas.forEach((k, ki) => {
      for (let i = 0; i < 8; i++) {
        murid.push([String(n++), (depan[(i + ki * 3) % 10] + ' ' + belakang[(i * 7 + ki) % 10]).toUpperCase(), k, 'YA']);
      }
    });
    const sebab = ['Bangun lewat', 'Kenderaan rosak / lewat', 'Hujan / banjir', 'Hal keluarga', 'Sakit / temujanji klinik', 'Lain-lain'];
    const rekod = [['ID', 'Timestamp', 'Tarikh', 'Masa', 'MinitLewat', 'NoDaftar', 'Nama', 'Kelas', 'Sebab', 'Catatan', 'DirekodOleh']];
    // Rekod rekaan untuk 45 hari lepas (hari bekerja sahaja)
    let r = 7;
    const rand = m => { r = (r * 9301 + 49297) % 233280; return Math.floor(r / 233280 * m); };
    for (let d = 45; d >= 1; d--) {
      const t = new Date(Date.now() - d * 86400000);
      const dow = Number(fmt(t, 'u'));
      if (dow > 5) continue;
      const bil = rand(5);
      for (let j = 0; j < bil; j++) {
        const m = murid[1 + (j === 0 ? rand(6) : rand(murid.length - 1))]; // beberapa murid jadi "kerap"
        const minit = 1 + rand(35);
        const masa = '07:' + String(20 + Math.min(minit, 39)).padStart(2, '0') + ':00';
        const s = sebab[rand(sebab.length)];
        rekod.push(['seed' + d + '-' + j, '', fmt(t, 'yyyy-MM-dd'), masa, minit, m[0], m[1], m[2], s,
          s === 'Lain-lain' ? 'Teman adik ke sekolah' : '', EMAIL.PENGAWAS]);
      }
    }
    return {
      MURID: murid,
      PENGGUNA: [['Email', 'Nama', 'Peranan'], [EMAIL.ADMIN, 'Cikgu Demo', 'ADMIN'], [EMAIL.PENGAWAS, 'Pengawas Demo', 'PENGAWAS']],
      SEBAB: [['Sebab']].concat(sebab.map(x => [x])),
      REKOD: rekod,
      IMPORT_APDM: [[]]
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
      H: String(Number(p.hour)), m: String(Number(p.minute)),
      u: String({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday])
    };
    return pattern.replace(/yyyy|MM|dd|HH|mm|ss|H|m|u/g, t => map[t]);
  }

  let db;
  try { db = JSON.parse(store(true, KEY)); } catch (e) { db = null; }
  if (!db || !db.MURID) db = seed();
  const save = () => store(false, [KEY, JSON.stringify(db)]);
  save();
  const role = store(true, ROLE_KEY) === 'PENGAWAS' ? 'PENGAWAS' : 'ADMIN';

  // ---------- Pengganti API Google ----------
  function sheet(name) {
    const rows = db[name];
    return {
      getDataRange: () => ({ getValues: () => rows.map(r => r.slice()), getDisplayValues: () => rows.map(r => r.map(String)) }),
      getLastRow: () => rows.length,
      getRange: (r, c) => ({
        setValues: v => {
          v.forEach((row, i) => {
            rows[r - 1 + i] = rows[r - 1 + i] || [];
            row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x instanceof Date ? x.toISOString() : x; });
          });
          save();
        }
      }),
      deleteRow: r => { rows.splice(r - 1, 1); save(); }
    };
  }
  window.SpreadsheetApp = { getActive: () => ({ getSheetByName: n => (db[n] ? sheet(n) : null) }) };
  window.Session = { getActiveUser: () => ({ getEmail: () => EMAIL[role] }) };
  window.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  let uid = 0;
  window.Utilities = {
    getUuid: () => 'demo-' + Date.now().toString(36) + '-' + (++uid),
    formatDate: (d, tz, p) => fmt(d, p)
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
  const bar = document.createElement('div');
  bar.style.cssText = 'background:#fef0c7;color:#7a2e0e;padding:8px 16px;font-size:13px;display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  bar.className = 'no-print';
  bar.innerHTML = '<b>MOD DEMO</b><span>Data rekaan, disimpan dalam browser ini sahaja.</span>' +
    '<span style="margin-left:auto">Login sebagai: <select id="demoRole" style="width:auto;padding:4px">' +
    '<option value="ADMIN">Admin (guru)</option><option value="PENGAWAS">Pengawas</option></select></span>' +
    '<button id="demoReset" class="btn sec sm">Reset data</button>';
  document.body.insertBefore(bar, document.body.firstChild);
  document.getElementById('demoRole').value = role;
  document.getElementById('demoRole').addEventListener('change', e => {
    store(false, [ROLE_KEY, e.target.value]);
    location.reload();
  });
  document.getElementById('demoReset').addEventListener('click', () => {
    if (!confirm('Padam semua rekod demo dan mula semula?')) return;
    db = seed(); save(); location.reload();
  });

  // ---------- Muat Code.gs sebenar ----------
  fetch('Code.gs', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('Gagal muat Code.gs'); return r.text(); })
    .then(src => {
      // Function dalam Code.gs jadi global; const kekal dalam skop eval
      (0, eval)(src + '\n;window.__slr = true;');
      mula();
    })
    .catch(e => { document.getElementById('loading').textContent = e.message; });
})();
