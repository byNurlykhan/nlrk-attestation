/* Админ / проктор панелі (admin.html) */
(function () {
  'use strict';

  const App = window.App;
  const T = (k, v) => window.I18n.t(k, v);
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = App.esc;
  const api = (action, data) => App.api(action, data, App.ADMIN_KEY);

  const STATUS_COLOR = { not_logged: 'gray', logged_in: 'blue', stage1: 'blue', stage1_done: 'purple', stage2: 'purple', finished: 'green', halted: 'pink' };
  const STATUSES = Object.keys(STATUS_COLOR);
  const BLOCKS = ['2', '3', '5', '6', '7'];
  const SETTINGS_NUM = ['stage1Minutes', 'stage2Minutes', 'wordLimit', 'minWords', 'testCountA', 'testCountB', 'maxLocks'];
  const SETTINGS_BOOL = ['cameraEnabled', 'showResults'];

  const A = { data: null, offset: 0, view: 'participants', viol: [], ans: [], ansCode: '', settingsDrawn: false, busy: false };

  function fmtDateTime(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('ru-RU');
  }
  function fmtTime(ms) { return ms ? new Date(ms).toLocaleTimeString('ru-RU') : '—'; }
  function vLabel(type) { const k = 'v.' + type; const s = T(k); return s === k ? type : s; }
  function byCode(code) { return (A.data ? A.data.participants : []).find(p => p.code === code); }

  function leftFor(p) {
    const now = Date.now() + A.offset;
    if (p.stage2Start && !p.stage2End) return p.deadline2 - now;
    if (p.stage1Start && !p.stage1End) return p.deadline1 - now;
    return null;
  }

  /* ---------- Кіру / шығу ---------- */

  function showLogin() {
    $('#admApp').classList.add('hidden');
    $('#admLogin').classList.remove('hidden');
    setTimeout(() => $('#admUser').focus(), 50);
  }

  function logout() {
    App.store.set(App.ADMIN_KEY, null);
    App.store.set('nlrk_admin_who', null);
    clearInterval(A.timer);
    showLogin();
  }

  async function doLogin(e) {
    e.preventDefault();
    const err = $('#admError');
    err.classList.add('hidden');
    const btn = $('#admBtn');
    btn.disabled = true;
    try {
      const r = await App.api('adminLogin', { login: $('#admUser').value.trim(), password: $('#admPass').value, ua: navigator.userAgent });
      App.store.set(App.ADMIN_KEY, r.token);
      App.store.set('nlrk_admin_who', r.login);
      $('#admPass').value = '';
      showApp();
    } catch (ex) {
      err.querySelector('span').textContent = App.errText(ex);
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  }

  function showApp() {
    $('#admLogin').classList.add('hidden');
    $('#admApp').classList.remove('hidden');
    $('#admWho').textContent = App.store.get('nlrk_admin_who') || '';
    go(A.view);
    refresh();
    clearInterval(A.timer);
    A.timer = setInterval(refresh, 10000);
  }

  function handleErr(e) {
    if (e && e.code === 'no_session') { logout(); return; }
    App.toast(App.errText(e), 'warn');
  }

  /* ---------- Деректер ---------- */

  async function refresh() {
    if (A.busy) return;
    A.busy = true;
    try {
      const r = await api('adminData');
      A.data = r;
      A.offset = r.now - Date.now();
      $('#admUpdated').textContent = T('adm.updated', { t: new Date().toLocaleTimeString('ru-RU') });
      renderTop();
      if (A.view === 'participants') renderParticipants();
      if (A.view === 'results') renderResults();
      if (A.view === 'violations') await loadViolations();
      if (A.view === 'settings' && !A.settingsDrawn) renderSettings();
      if (A.view === 'answers' && !$('#aWho').options.length) renderAnswerSelect();
    } catch (e) {
      handleErr(e);
    } finally {
      A.busy = false;
    }
  }

  async function act(op, p, extra) {
    try {
      await api('adminAction', Object.assign({ op: op, code: p ? p.code : undefined }, extra || {}));
      App.toast(T('adm.done'), 'ok');
      refresh();
    } catch (e) {
      handleErr(e);
    }
  }

  /* ---------- Жоғарғы панель ---------- */

  function renderTop() {
    const titles = { participants: 'adm.nav.participants', violations: 'adm.nav.violations', answers: 'adm.nav.answers', results: 'adm.nav.results', settings: 'adm.nav.settings', export: 'adm.nav.export' };
    $('#admTitle').textContent = T(titles[A.view]);
    if (!A.data) return;
    const open = !!A.data.settings.sessionOpen;
    $('#sessPill').className = 'pill ' + (open ? 'green' : 'gray');
    $('#sessDot').classList.toggle('on', open);
    $('#sessText').textContent = T(open ? 'adm.sessionOpen' : 'adm.sessionClosed');
    const btn = $('#sessBtn');
    btn.textContent = T(open ? 'adm.close' : 'adm.open');
    btn.className = 'btn btn-sm ' + (open ? 'btn-danger' : 'btn-success');
    const locked = A.data.participants.filter(p => p.locked && !p.halted).length;
    $('#badgeLocked').textContent = locked ? String(locked) : '';
  }

  async function toggleSession() {
    if (!A.data) return;
    const open = !!A.data.settings.sessionOpen;
    if (!confirm(T(open ? 'adm.confirmClose' : 'adm.confirmOpen'))) return;
    try {
      await api('adminAction', { op: 'setSession', value: !open });
      refresh();
    } catch (e) {
      handleErr(e);
    }
  }

  function go(v) {
    A.view = v;
    $$('#admApp .view').forEach(s => s.classList.toggle('hidden', s.dataset.section !== v));
    $$('#admApp .nav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    renderTop();
    if (!A.data) return;
    if (v === 'participants') renderParticipants();
    if (v === 'results') renderResults();
    if (v === 'violations') loadViolations();
    if (v === 'answers') renderAnswerSelect();
    if (v === 'settings') renderSettings();
    App.icons();
  }

  /* ---------- Қатысушылар ---------- */

  function renderStatusFilter() {
    const sel = $('#pStatus');
    const cur = sel.value;
    sel.innerHTML = '<option value="">' + esc(T('adm.col.status')) + ': ' + esc(T('adm.filter.all')) + '</option>' +
      STATUSES.map(s => '<option value="' + s + '">' + esc(T('adm.st.' + s)) + '</option>').join('') +
      '<option value="locked">' + esc(T('adm.lockedNow')) + '</option>';
    sel.value = cur;
  }

  function renderParticipants() {
    const d = A.data;
    if (!d) return;
    const list = d.participants;
    const stat = (icon, color, label, value) =>
      '<div class="card stat"><div class="stat-top"><span class="stat-label">' + esc(label) + '</span><span class="chip ' + color + '"><i data-lucide="' + icon + '"></i></span></div><div class="stat-value">' + value + '</div></div>';
    $('#admStats').innerHTML =
      stat('users', 'c-blue', T('adm.stat.total'), list.length) +
      stat('pen-line', 'c-purple', T('adm.stat.active'), list.filter(p => ['stage1', 'stage1_done', 'stage2'].indexOf(p.status) >= 0).length) +
      stat('lock', 'c-pink', T('adm.stat.locked'), list.filter(p => p.locked && !p.halted).length) +
      stat('trophy', 'c-green', T('adm.stat.finished'), list.filter(p => p.status === 'finished').length) +
      stat('ban', 'c-amber', T('adm.stat.halted'), list.filter(p => p.halted).length);

    if (!$('#pStatus').options.length) renderStatusFilter();

    // Админ блокты таңдап жатқанда кестені қайта салмаймыз
    const active = document.activeElement;
    if (active && active.closest && active.closest('#pTable') && active.tagName === 'SELECT') { App.icons(); return; }

    const q = $('#pSearch').value.trim().toLowerCase();
    const f = $('#pStatus').value;
    const rows = list.filter(p =>
      (!q || p.fullName.toLowerCase().indexOf(q) >= 0 || p.code.indexOf(q) >= 0) &&
      (!f || (f === 'locked' ? p.locked : p.status === f)));

    const head = '<thead><tr><th>' + [T('adm.col.code'), T('adm.col.name') + ' / ' + T('adm.col.dept'), T('adm.col.block'), T('adm.col.status'),
      T('adm.col.locks'), T('adm.col.warns'), T('adm.col.time'), T('adm.col.last'), T('adm.col.actions')].map(esc).join('</th><th>') + '</th></tr></thead>';

    const body = rows.map(p => {
      const left = leftFor(p);
      const stageActive = left != null;
      const st = '<span class="pill ' + STATUS_COLOR[p.status] + '">' + esc(T('adm.st.' + p.status)) + '</span>' +
        (p.locked && !p.halted ? ' <span class="pill pink"><i data-lucide="lock"></i>' + esc(T('adm.lockedNow')) + '</span>' : '') +
        (p.loginBlocked ? ' <span class="pill amber">' + esc(T('adm.loginBlocked')) + '</span>' : '');
      const blockSel = '<select class="input" data-block="' + p.code + '">' + BLOCKS.map(b =>
        '<option value="' + b + '"' + (b === p.block ? ' selected' : '') + '>№' + b + '</option>').join('') + '</select>';
      const lockTitle = p.lockInfo ? vLabel(p.lockInfo.type) + ' · ' + fmtTime(p.lockInfo.at) : '';
      return '<tr class="' + (p.locked && !p.halted ? 'row-locked' : '') + '">' +
        '<td class="num">' + esc(p.code) + '</td>' +
        '<td><div class="name">' + esc(p.fullName) + '</div><div class="sub clip" title="' + esc(App.personField(p, 'position')) + '">' + esc(App.personField(p, 'dept')) + '</div></td>' +
        '<td>' + blockSel + '</td>' +
        '<td title="' + esc(lockTitle) + '">' + st + '</td>' +
        '<td class="num"><b>' + p.locks + '</b> / ' + d.settings.maxLocks + '</td>' +
        '<td class="num">' + p.warns + '</td>' +
        '<td class="num">' + (stageActive ? App.fmtLeft(left) : '—') + (p.extra1 || p.extra2 ? ' <span class="sub">+' + (p.extra1 + p.extra2) + '′</span>' : '') + '</td>' +
        '<td class="num">' + fmtTime(p.lastActive) + '</td>' +
        '<td><div class="acts">' +
          '<button class="icon-btn" data-act="resetCode" data-code="' + p.code + '" title="' + esc(T('adm.act.reset')) + '"><i data-lucide="key-round"></i></button>' +
          '<button class="icon-btn" data-act="unlock" data-code="' + p.code + '" title="' + esc(T('adm.act.unlock')) + '"' + (p.locked && !p.halted ? '' : ' disabled') + '><i data-lucide="lock-open"></i></button>' +
          '<button class="icon-btn danger" data-act="halt" data-code="' + p.code + '" title="' + esc(T('adm.act.halt')) + '"' + (!p.halted && p.stage1Start && !p.stage2End ? '' : ' disabled') + '><i data-lucide="ban"></i></button>' +
          '<button class="icon-btn" data-act="resume" data-code="' + p.code + '" title="' + esc(T('adm.act.resume')) + '"' + (p.halted ? '' : ' disabled') + '><i data-lucide="play"></i></button>' +
          '<button class="icon-btn" data-act="addTime" data-code="' + p.code + '" title="' + esc(T('adm.act.addTime')) + '"' + (stageActive || (p.stage1End && !p.stage2Start) ? '' : ' disabled') + '><i data-lucide="timer"></i></button>' +
        '</div></td></tr>';
    }).join('');

    $('#pTable').innerHTML = head + '<tbody>' + (body || '<tr><td colspan="9" class="empty-row">' + esc(T('adm.v.empty')) + '</td></tr>') + '</tbody>';
    App.icons();
  }

  function onTableClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const p = byCode(b.dataset.code);
    if (!p) return;
    const op = b.dataset.act;
    const name = p.fullName;
    if (op === 'addTime') {
      const v = prompt(T('adm.prompt.minutes', { name: name }), '5');
      if (v == null) return;
      const n = parseInt(v, 10);
      if (!n) return;
      act('addTime', p, { value: n });
      return;
    }
    const keys = { resetCode: 'adm.confirm.reset', unlock: 'adm.confirm.unlock', halt: 'adm.confirm.halt', resume: 'adm.confirm.resume' };
    if (!confirm(T(keys[op], { name: name }))) return;
    act(op, p);
  }

  function onTableChange(e) {
    const s = e.target.closest('[data-block]');
    if (!s) return;
    const p = byCode(s.dataset.block);
    if (!p) return;
    if (!confirm(T('adm.confirm.block', { name: p.fullName }))) { s.value = p.block; s.blur(); return; }
    s.blur();
    act('setBlock', p, { value: s.value });
  }

  /* ---------- Бұзушылықтар журналы ---------- */

  async function loadViolations() {
    try {
      const r = await api('adminViolations');
      A.viol = r.list || [];
      renderViolFilters();
      renderViolations();
    } catch (e) {
      handleErr(e);
    }
  }

  function renderViolFilters() {
    const keep = sel => sel.value;
    const who = $('#vWho');
    const type = $('#vType');
    const sev = $('#vSev');
    const w = keep(who);
    const t = keep(type);
    const s = keep(sev);
    const people = (A.data ? A.data.participants : []).slice().sort((a, b) => a.fullName.localeCompare(b.fullName));
    who.innerHTML = '<option value="">' + esc(T('adm.filter.participant')) + ': ' + esc(T('adm.filter.all')) + '</option>' +
      people.map(p => '<option value="' + p.code + '">' + esc(p.fullName) + '</option>').join('');
    const types = Array.from(new Set(A.viol.map(v => v.type))).sort();
    type.innerHTML = '<option value="">' + esc(T('adm.filter.type')) + ': ' + esc(T('adm.filter.all')) + '</option>' +
      types.map(x => '<option value="' + esc(x) + '">' + esc(vLabel(x)) + '</option>').join('');
    sev.innerHTML = '<option value="">' + esc(T('adm.filter.severity')) + ': ' + esc(T('adm.filter.all')) + '</option>' +
      ['lock', 'warn', 'admin'].map(x => '<option value="' + x + '">' + esc(T('adm.sev.' + x)) + '</option>').join('');
    who.value = w; type.value = t; sev.value = s;
  }

  function renderViolations() {
    const w = $('#vWho').value;
    const t = $('#vType').value;
    const s = $('#vSev').value;
    const rows = A.viol.filter(v => (!w || v.code === w) && (!t || v.type === t) && (!s || v.severity === s));
    const sevColor = { lock: 'pink', warn: 'amber', admin: 'blue' };
    const head = '<thead><tr><th>' + [T('adm.v.time'), T('adm.col.name'), T('adm.filter.type'), T('adm.filter.severity'), T('adm.v.stage'),
      T('adm.v.item'), T('adm.v.detail'), T('adm.v.lockNo'), T('adm.v.unlockedBy')].map(esc).join('</th><th>') + '</th></tr></thead>';
    const body = rows.map(v =>
      '<tr><td class="num">' + fmtDateTime(v.time) + '</td>' +
      '<td class="name">' + esc(v.fullName) + '</td>' +
      '<td>' + esc(vLabel(v.type)) + '</td>' +
      '<td><span class="pill ' + (sevColor[v.severity] || 'gray') + '">' + esc(T('adm.sev.' + v.severity)) + '</span></td>' +
      '<td class="num">' + esc(v.stage) + '</td>' +
      '<td class="num">' + esc(v.item) + '</td>' +
      '<td class="sub">' + esc(v.detail) + '</td>' +
      '<td class="num">' + esc(v.lockNo) + '</td>' +
      '<td class="sub">' + esc(v.unlockedBy || '') + (v.unlockedAt ? '<br>' + fmtTime(v.unlockedAt) : '') + '</td></tr>').join('');
    $('#vTable').innerHTML = head + '<tbody>' + (body || '<tr><td colspan="9" class="empty-row">' + esc(T('adm.v.empty')) + '</td></tr>') + '</tbody>';
  }

  /* ---------- 1-кезең жауаптары ---------- */

  function renderAnswerSelect() {
    if (!A.data) return;
    const sel = $('#aWho');
    const cur = sel.value || A.ansCode;
    const people = A.data.participants.filter(p => p.stage1Start).sort((a, b) => a.fullName.localeCompare(b.fullName));
    sel.innerHTML = '<option value="">' + esc(T('adm.ans.select')) + '</option>' +
      people.map(p => '<option value="' + p.code + '">' + esc(p.fullName) + ' · ' + esc(T('adm.st.' + p.status)) +
        ' · ' + p.s1Graded + '/' + p.s1Answered + '</option>').join('');
    sel.value = cur;
  }

  async function loadAnswers(code) {
    A.ansCode = code;
    const box = $('#aList');
    $('#aGraded').textContent = '';
    $('#aTotal').textContent = '';
    if (!code) { box.innerHTML = ''; return; }
    try {
      const r = await api('adminAnswers', { code: code });
      A.ans = r.list || [];
      renderAnswers();
    } catch (e) {
      handleErr(e);
    }
  }

  function renderAnswers() {
    const box = $('#aList');
    const lang = window.I18n.lang;
    if (!A.ans.length) {
      box.innerHTML = '<div class="card center-card"><p>' + esc(T('adm.ans.none')) + '</p></div>';
      return;
    }
    const graded = A.ans.filter(a => a.score !== '' && a.score != null).length;
    const total = A.ans.reduce((s, a) => s + (Number(a.score) || 0), 0);
    $('#aGraded').textContent = T('adm.ans.graded', { g: graded, n: A.ans.length });
    $('#aTotal').textContent = T('adm.ans.total', { s: total });
    box.innerHTML = A.ans.map((a, i) =>
      '<div class="card ans-item">' +
        '<div class="card-head"><span class="chip sm ' + (a.kind === 'prof' ? 'c-purple' : 'c-green') + '"><i data-lucide="pen-line"></i></span>' +
        '<h3>' + esc(T('s1.task', { n: a.taskNo })) + ' · ' + esc(a.kind === 'prof' ? T('s1.prof') : T('s1.gen')) + (a.topic ? ' · ' + esc(a.topic) : '') + '</h3>' +
        '<span class="pill gray">' + a.words + ' ' + esc(T('adm.ans.words')) + '</span></div>' +
        '<div class="muted">' + esc(lang === 'ru' ? a.task_ru : a.task_kz) + '</div>' +
        '<div class="ans-text">' + (a.text ? esc(a.text) : '<span class="muted">' + esc(T('adm.ans.empty')) + '</span>') + '</div>' +
        '<div class="grade-row">' +
          '<div class="field"><label>' + esc(T('adm.ans.score')) + '</label><input class="input" type="number" step="0.5" min="0" data-score="' + i + '" value="' + esc(a.score) + '"></div>' +
          '<div class="field"><label>' + esc(T('adm.ans.comment')) + '</label><textarea class="input" data-comment="' + i + '">' + esc(a.comment) + '</textarea></div>' +
          '<button class="btn btn-primary" data-save="' + i + '"' + (a.text ? '' : ' disabled') + '><i data-lucide="save"></i>' + esc(T('adm.ans.save')) + '</button>' +
        '</div>' +
      '</div>').join('');
    App.icons();
  }

  async function saveGrade(i) {
    const a = A.ans[i];
    const score = $('[data-score="' + i + '"]').value;
    const comment = $('[data-comment="' + i + '"]').value;
    try {
      await api('adminGrade', { code: a.code, taskId: a.taskId, score: score, comment: comment });
      a.score = score === '' ? '' : Number(score);
      a.comment = comment;
      App.toast(T('adm.ans.saved'), 'ok');
      const graded = A.ans.filter(x => x.score !== '' && x.score != null).length;
      $('#aGraded').textContent = T('adm.ans.graded', { g: graded, n: A.ans.length });
      $('#aTotal').textContent = T('adm.ans.total', { s: A.ans.reduce((s, x) => s + (Number(x.score) || 0), 0) });
    } catch (e) {
      handleErr(e);
    }
  }

  /* ---------- 2-кезең нәтижелері ---------- */

  function renderResults() {
    const d = A.data;
    if (!d) return;
    const pct = p => (p.totalA + p.totalB) ? Math.round(100 * (p.scoreA + p.scoreB) / (p.totalA + p.totalB)) : 0;
    const rows = d.participants.slice().sort((a, b) => a.fullName.localeCompare(b.fullName));
    const head = '<thead><tr><th>' + [T('adm.col.code'), T('adm.col.name'), T('adm.col.block'), T('adm.col.status'), T('adm.res.a'), T('adm.res.b'),
      T('adm.res.total'), T('adm.res.pct'), T('adm.res.s1')].map(esc).join('</th><th>') + '</th></tr></thead>';
    const body = rows.map(p => {
      const fin = !!p.stage2End;
      return '<tr><td class="num">' + esc(p.code) + '</td><td class="name">' + esc(p.fullName) + '</td><td>№' + esc(p.block) + '</td>' +
        '<td><span class="pill ' + STATUS_COLOR[p.status] + '">' + esc(T('adm.st.' + p.status)) + '</span></td>' +
        '<td class="num">' + (fin ? p.scoreA + ' / ' + p.totalA : '—') + '</td>' +
        '<td class="num">' + (fin ? p.scoreB + ' / ' + p.totalB : '—') + '</td>' +
        '<td class="num"><b>' + (fin ? (p.scoreA + p.scoreB) + ' / ' + (p.totalA + p.totalB) : '—') + '</b></td>' +
        '<td class="num">' + (fin ? pct(p) + '%' : '—') + '</td>' +
        '<td class="num">' + (p.s1Graded ? p.s1Score + ' <span class="sub">(' + p.s1Graded + '/' + p.s1Answered + ')</span>' : '—') + '</td></tr>';
    }).join('');
    $('#rTable').innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  /* ---------- Баптаулар ---------- */

  function renderSettings() {
    const d = A.data;
    if (!d) return;
    A.settingsDrawn = true;
    const s = d.settings;
    const num = k => '<div class="set-item"><label for="set_' + k + '">' + esc(T('adm.set.' + k)) + '</label>' +
      '<input class="input" type="number" min="0" id="set_' + k + '" data-set="' + k + '" value="' + esc(s[k]) + '"></div>';
    const bool = k => '<div class="set-item"><label for="set_' + k + '">' + esc(T('adm.set.' + k)) + '</label>' +
      '<label class="switch"><input type="checkbox" id="set_' + k + '" data-set="' + k + '"' + (s[k] ? ' checked' : '') + '><span></span></label></div>';
    $('#setGrid').innerHTML = SETTINGS_NUM.map(num).join('') + SETTINGS_BOOL.map(bool).join('') +
      '<div class="set-item"><label>' + esc(T('adm.set.pin')) + '</label><span class="pill ' + (s.proctorPinSet ? 'green' : 'pink') + '">' +
      esc(T(s.proctorPinSet ? 'adm.set.pinYes' : 'adm.set.pinNo')) + '</span></div>';
  }

  async function saveSetting(e) {
    const inp = e.target.closest('[data-set]');
    if (!inp) return;
    const key = inp.dataset.set;
    const value = inp.type === 'checkbox' ? inp.checked : inp.value;
    try {
      const r = await api('adminAction', { op: 'setSetting', key: key, value: value });
      if (A.data) A.data.settings = r.settings;
      App.toast(T('adm.set.saved'), 'ok');
    } catch (ex) {
      handleErr(ex);
    }
  }

  /* ---------- Жүктеу ---------- */

  function stamp() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '_' +
      String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  }

  function buildSheets(r) {
    const lang = window.I18n.lang;
    const parts = [[T('adm.col.code'), T('adm.col.name'), T('adm.col.dept'), T('f.pos'), T('adm.col.block'), T('adm.col.status'),
      T('adm.col.locks'), T('adm.col.warns'), T('adm.res.a'), 'max', T('adm.res.b'), 'max', T('adm.res.pct'), T('adm.res.s1'),
      '1: start', '1: end', '2: start', '2: end']];
    r.participants.forEach(p => {
      const tot = p.totalA + p.totalB;
      parts.push([p.code, p.fullName, App.personField(p, 'dept'), App.personField(p, 'position'), '№' + p.block, T('adm.st.' + p.status),
        p.locks, p.warns, p.stage2End ? p.scoreA : '', p.stage2End ? p.totalA : '', p.stage2End ? p.scoreB : '', p.stage2End ? p.totalB : '',
        p.stage2End && tot ? Math.round(100 * (p.scoreA + p.scoreB) / tot) : '', p.s1Graded ? p.s1Score : '',
        fmtDateTime(p.stage1Start), fmtDateTime(p.stage1End), fmtDateTime(p.stage2Start), fmtDateTime(p.stage2End)]);
    });
    const ans = [[T('adm.col.code'), T('adm.col.name'), '№', 'ID', T('adm.filter.type'), T('s1.task', { n: '' }).trim(), T('s1.answer'),
      T('adm.ans.words'), T('adm.ans.score'), T('adm.ans.comment'), 'by']];
    r.answers.forEach(a => ans.push([a.code, a.fullName, a.taskNo, a.taskId, a.kind === 'prof' ? T('s1.prof') : T('s1.gen'),
      lang === 'ru' ? a.task_ru : a.task_kz, a.text, a.words, a.score, a.comment, a.gradedBy || '']));
    const viol = [[T('adm.v.time'), T('adm.col.code'), T('adm.col.name'), T('adm.filter.type'), T('adm.filter.severity'), T('adm.v.stage'),
      T('adm.v.item'), T('adm.v.detail'), T('adm.v.lockNo'), T('adm.v.unlockedBy'), T('adm.v.time')]];
    r.violations.slice().reverse().forEach(v => viol.push([fmtDateTime(v.time), v.code, v.fullName, vLabel(v.type), T('adm.sev.' + v.severity),
      v.stage, v.item, v.detail, v.lockNo, v.unlockedBy || '', v.unlockedAt ? fmtDateTime(v.unlockedAt) : '']));
    return { participants: parts, answers: ans, violations: viol };
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function toCsv(rows) {
    // Excel (KZ/RU) үшін бөлгіш — нүктелі үтір, басында BOM
    return '﻿' + rows.map(r => r.map(c => {
      const s = String(c == null ? '' : c);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
  }

  async function doExport(kind, btn) {
    const label = btn.querySelector('span');
    const old = label.textContent;
    btn.disabled = true;
    label.textContent = T('adm.exp.loading');
    try {
      const r = await api('adminExport');
      const sh = buildSheets(r);
      const base = 'attestation_' + stamp();
      if (kind === 'xlsx' && window.XLSX) {
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(sh.participants), 'Participants');
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(sh.answers), 'Stage1');
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(sh.violations), 'Violations');
        window.XLSX.writeFile(wb, base + '.xlsx');
      } else {
        download(new Blob([toCsv(sh.participants)], { type: 'text/csv;charset=utf-8' }), base + '_participants.csv');
        setTimeout(() => download(new Blob([toCsv(sh.answers)], { type: 'text/csv;charset=utf-8' }), base + '_stage1.csv'), 400);
        setTimeout(() => download(new Blob([toCsv(sh.violations)], { type: 'text/csv;charset=utf-8' }), base + '_violations.csv'), 800);
      }
    } catch (e) {
      handleErr(e);
    } finally {
      btn.disabled = false;
      label.textContent = old;
    }
  }

  /* ---------- Іске қосу ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    if (!App.isDesktop()) return;
    $('#admForm').addEventListener('submit', doLogin);
    $('#admLogout').addEventListener('click', logout);
    $('#sessBtn').addEventListener('click', toggleSession);
    $$('#admApp .nav [data-view]').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
    $('#pTable').addEventListener('click', onTableClick);
    $('#pTable').addEventListener('change', onTableChange);
    $('#pSearch').addEventListener('input', renderParticipants);
    $('#pStatus').addEventListener('change', renderParticipants);
    ['#vWho', '#vType', '#vSev'].forEach(s => $(s).addEventListener('change', renderViolations));
    $('#aWho').addEventListener('change', e => loadAnswers(e.target.value));
    $('#aList').addEventListener('click', e => { const b = e.target.closest('[data-save]'); if (b) saveGrade(Number(b.dataset.save)); });
    $('#setGrid').addEventListener('change', saveSetting);
    $('#rescoreBtn').addEventListener('click', async () => {
      try {
        const r = await api('adminAction', { op: 'rescore' });
        App.toast(T('adm.res.rescored', { n: r.count }), 'ok');
        refresh();
      } catch (e) {
        handleErr(e);
      }
    });
    $('#expXlsx').addEventListener('click', e => doExport('xlsx', e.currentTarget));
    $('#expCsv').addEventListener('click', e => doExport('csv', e.currentTarget));

    window.I18n.onChange(() => {
      renderTop();
      renderStatusFilter();
      A.settingsDrawn = false;
      go(A.view);
      if (A.view === 'answers' && A.ans.length) renderAnswers();
    });

    if (App.store.get(App.ADMIN_KEY)) showApp(); else showLogin();
  });
})();
