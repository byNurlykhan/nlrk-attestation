/* Ортақ утилиталар, кіру беті және аттестация беті (exam.html) */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const T = (k, v) => window.I18n.t(k, v);
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const TOKEN_KEY = 'nlrk_token';
  const ADMIN_KEY = 'nlrk_admin';

  /* ============================ Утилиталар ================================= */

  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) {
      try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* */ }
    }
  };

  function apiReady() {
    return !!CFG.API_URL && CFG.API_URL.indexOf('ВАШ_DEPLOYMENT_ID') < 0;
  }

  function mkErr(code) {
    const e = new Error(code);
    e.code = code;
    return e;
  }

  // text/plain — CORS preflight болмауы үшін (Apps Script талабы)
  async function api(action, data, tokenKey) {
    if (!apiReady()) throw mkErr('no_config');
    const body = JSON.stringify(Object.assign({ action: action, token: store.get(tokenKey || TOKEN_KEY) }, data || {}));
    let res;
    try {
      res = await fetch(CFG.API_URL, {
        method: 'POST', body: body, redirect: 'follow', cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
    } catch (e) {
      throw mkErr('network');
    }
    let j;
    try { j = await res.json(); } catch (e) { throw mkErr('server_error'); }
    if (!j.ok) throw Object.assign(mkErr(j.error || 'unknown'), j);
    return j;
  }

  // Бет жабылып жатқанда да жеткізілетін сұраныс
  function beacon(action, data) {
    if (!apiReady() || !navigator.sendBeacon) return false;
    const body = JSON.stringify(Object.assign({ action: action, token: store.get(TOKEN_KEY) }, data || {}));
    try {
      return navigator.sendBeacon(CFG.API_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }));
    } catch (e) {
      return false;
    }
  }

  function errText(e) {
    const code = (e && e.code) || 'unknown';
    const key = 'err.' + code;
    const s = T(key, e);
    return s === key ? T('err.unknown') : s;
  }

  function icons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toast(msg, kind) {
    const host = $('#toastHost');
    if (!host) return;
    const d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.textContent = msg;
    host.appendChild(d);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(() => d.remove(), 3500);
  }

  function hhmm(d) {
    return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtLeft(ms) {
    if (ms == null) return '—';
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : String(m).padStart(2, '0') + ':' + ss;
  }

  function countWords(text) {
    const t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function isDesktop() {
    const ua = navigator.userAgent;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini/i.test(ua);
    const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    return !mobileUA && !iPadOS && Math.max(window.screen.width, window.screen.height) >= 1024;
  }

  // Ішкі растау терезесі (confirm() терезеден фокусты алып кетеді, сондықтан қолданбаймыз)
  function modal(o) {
    return new Promise(resolve => {
      const m = $('#modal');
      $('#modalTitle').textContent = o.title || '';
      $('#modalText').textContent = o.text || '';
      const ok = $('#modalOk');
      const cancel = $('#modalCancel');
      ok.textContent = o.ok || T('btn.confirm');
      ok.className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary');
      cancel.textContent = o.cancel || T('btn.cancel');
      cancel.classList.toggle('hidden', !!o.noCancel);
      m.classList.remove('hidden');
      const done = v => { m.classList.add('hidden'); ok.onclick = cancel.onclick = null; resolve(v); };
      ok.onclick = () => done(true);
      cancel.onclick = () => done(false);
      setTimeout(() => ok.focus(), 30);
    });
  }

  function personField(p, key) {
    const lang = window.I18n.lang;
    return (lang === 'ru' ? p[key + '_ru'] : p[key + '_kz']) || p[key + '_kz'] || '';
  }

  window.App = {
    api: api, beacon: beacon, errText: errText, icons: icons, esc: esc, toast: toast,
    hhmm: hhmm, fmtLeft: fmtLeft, store: store, modal: modal, isDesktop: isDesktop,
    personField: personField, ADMIN_KEY: ADMIN_KEY, TOKEN_KEY: TOKEN_KEY
  };

  /* ============================ Кіру беті ================================== */

  const FOLD = { 'ә': 'а', 'ө': 'о', 'ү': 'у', 'ұ': 'у', 'қ': 'к', 'ғ': 'г', 'ң': 'н', 'і': 'и', 'һ': 'х', 'ё': 'е', 'й': 'и' };

  // Үлкен-кіші әріпті және ә/а, ө/о, ү/у, ұ/у, қ/к, ғ/г, ң/н, і/и айырмашылығын ескермейді
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[әөүұқғңіһёй]/g, c => FOLD[c])
      .replace(/[^a-zа-я0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  const Login = {
    list: [],
    sel: null,
    hits: [],
    idx: -1,

    async init() {
      if (store.get(TOKEN_KEY)) { location.replace('exam.html'); return; }
      const name = $('#nameInput');
      const code = $('#codeInput');

      const setOrg = () => { $('#orgInput').value = T('app.org'); this.fillSel(); };
      setOrg();
      window.I18n.onChange(() => { setOrg(); if (!$('#acList').classList.contains('hidden')) this.renderList(); });

      name.addEventListener('input', () => {
        this.sel = null;
        this.fillSel();
        this.search(name.value);
      });
      name.addEventListener('keydown', e => {
        const open = !$('#acList').classList.contains('hidden');
        if (e.key === 'ArrowDown' && open) { e.preventDefault(); this.move(1); }
        else if (e.key === 'ArrowUp' && open) { e.preventDefault(); this.move(-1); }
        else if (e.key === 'Enter' && open && this.idx >= 0) { e.preventDefault(); this.pick(this.hits[this.idx]); }
        else if (e.key === 'Escape') { this.close(); }
      });
      name.addEventListener('blur', () => setTimeout(() => {
        this.close();
        if (!this.sel) {
          const exact = this.list.find(x => x.norm === norm(name.value));
          if (exact) this.pick(exact);
        }
      }, 150));
      name.addEventListener('focus', () => { if (!this.sel && name.value) this.search(name.value); });

      code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 4); });
      $('#toggleCode').addEventListener('click', () => {
        const show = code.type === 'password';
        code.type = show ? 'text' : 'password';
        $('#toggleCode').innerHTML = '<i data-lucide="' + (show ? 'eye-off' : 'eye') + '"></i>';
        icons();
      });

      $('#loginForm').addEventListener('submit', e => { e.preventDefault(); this.submit(); });

      try {
        const r = await api('names');
        this.list = (r.list || []).map(x => Object.assign(x, { norm: norm(x.name) }));
        $('#closedBanner').classList.toggle('hidden', !!r.sessionOpen);
      } catch (err) {
        this.showError(errText(err));
      }
    },

    search(q) {
      const nq = norm(q);
      if (nq.replace(/[\s-]/g, '').length < 2) { this.close(); return; }
      const parts = nq.split(' ').filter(Boolean);
      this.hits = this.list.filter(x => {
        const words = x.norm.split(/[\s-]/);
        return parts.every(p => words.some(w => w.indexOf(p) === 0));
      }).slice(0, 8);
      this.idx = this.hits.length ? 0 : -1;
      this.renderList();
    },

    renderList() {
      const box = $('#acList');
      if (!this.hits.length) {
        box.innerHTML = '<div class="ac-empty">' + esc(T('f.name.none')) + '</div>';
      } else {
        box.innerHTML = this.hits.map((x, i) =>
          '<div class="ac-item' + (i === this.idx ? ' active' : '') + '" role="option" data-i="' + i + '">' +
          '<b>' + esc(x.name) + '</b><span class="small">' + esc(personField(x, 'dept')) + '</span></div>').join('');
        $$('.ac-item', box).forEach(it => it.addEventListener('mousedown', e => {
          e.preventDefault();
          this.pick(this.hits[Number(it.dataset.i)]);
        }));
      }
      box.classList.remove('hidden');
      $('#nameInput').setAttribute('aria-expanded', 'true');
    },

    move(d) {
      if (!this.hits.length) return;
      this.idx = (this.idx + d + this.hits.length) % this.hits.length;
      this.renderList();
    },

    close() {
      $('#acList').classList.add('hidden');
      $('#nameInput').setAttribute('aria-expanded', 'false');
    },

    pick(x) {
      if (!x) return;
      this.sel = x;
      $('#nameInput').value = x.name;
      $('#nameInput').classList.remove('invalid');
      this.fillSel();
      this.close();
      $('#codeInput').focus();
    },

    fillSel() {
      $('#deptInput').value = this.sel ? personField(this.sel, 'dept') : '';
      $('#posInput').value = this.sel ? personField(this.sel, 'position') : '';
    },

    showError(msg) {
      const box = $('#loginError');
      if (!msg) { box.classList.add('hidden'); return; }
      box.querySelector('span').textContent = msg;
      box.classList.remove('hidden');
    },

    async submit() {
      this.showError('');
      const code = $('#codeInput').value.trim();
      if (!this.sel) { $('#nameInput').classList.add('invalid'); this.showError(T('err.select_name')); return; }
      if (!/^\d{4}$/.test(code)) { this.showError(T('err.code_format')); return; }
      const btn = $('#loginBtn');
      btn.disabled = true;
      btn.querySelector('span').textContent = T('login.loading');
      try {
        const r = await api('login', { name: this.sel.name, code: code, ua: navigator.userAgent });
        store.set(TOKEN_KEY, r.token);
        location.replace('exam.html');
      } catch (err) {
        if (err.code === 'session_closed') $('#closedBanner').classList.remove('hidden');
        this.showError(errText(err));
        $('#codeInput').value = '';
        btn.disabled = false;
        btn.querySelector('span').textContent = T('login.btn');
      }
    }
  };

  /* ============================ Аттестация беті ============================ */

  const LETTERS = 'АБВГДЕ';

  const E = {
    st: null, offset: 0, view: 'home', sig: '',
    tasks: [], answers: {}, ver1: {}, dirty1: new Set(), cur1: 0, lastValid: '', caret: 0,
    qs: [], choices: {}, ver2: {}, dirty2: new Set(), cur2: 0, flags: new Set(), s2timer: null,
    queue: Promise.resolve(), ticking: false, finishing: false,
    pendingLock: null, lastLockAt: 0, shownLock: '', lastSaved: null, saveState: ''
  };

  const Exam = {
    async init() {
      if (!store.get(TOKEN_KEY)) { location.replace('index.html'); return; }
      try { (JSON.parse(store.get('nlrk_flags') || '[]')).forEach(n => E.flags.add(n)); } catch (e) { /* */ }

      window.Proctor.setup({
        onLock: (type, detail) => this.onLock(type, detail),
        onWarn: (type, n) => {
          const c = this.ctx();
          api('violation', { severity: 'warn', type: type, detail: '×' + n, stage: c.stage, item: c.item }).catch(() => {});
        },
        onUnlock: pin => this.unlock(pin),
        onPageHide: () => { this.beaconSave(); beacon('violation', Object.assign({ severity: 'lock', type: 'unload' }, this.ctx())); },
        onFsRestored: () => {},
        needCamera: () => !!(E.st && E.st.cfg.cameraEnabled),
        getLocks: () => (E.st ? E.st.locks : 0),
        getMaxLocks: () => (E.st ? E.st.maxLocks : 3)
      });

      const single = await window.Proctor.checkSingleTab();
      if (!single) {
        $('#tabOverlay').classList.remove('hidden');
        beacon('violation', { severity: 'warn', type: 'multitab', detail: 'second tab' });
        return;
      }

      $$('.nav [data-view]').forEach(b => b.addEventListener('click', () => this.go(b.dataset.view)));
      $('#exitBtn').addEventListener('click', () => this.exit());
      $('#agreeBox').addEventListener('change', e => { $('#startBtn').disabled = !e.target.checked; });
      $('#startBtn').addEventListener('click', () => this.start());
      window.I18n.onChange(() => { this.chrome(); this.render(true); });

      await this.refreshFull(true);
      setInterval(() => this.tick(), 15000);
      setInterval(() => { if (window.Proctor.locked || window.Proctor.halted) this.tick(); }, 5000);
      setInterval(() => this.clock(), 1000);
    },

    async refreshFull(first) {
      try {
        const sentAt = Date.now();
        const r = await api('state', { full: true });
        this.load(r, sentAt);
        if (first) {
          const st = E.st;
          let v = 'home';
          if (!st.stage1.start) v = 'rules';
          else if (!st.stage1.end) v = 'stage1';
          else if (!st.stage2.end) v = 'stage2';
          this.go(v, true);
        }
      } catch (e) {
        if (e.code === 'no_session') return this.toLogin();
        toast(errText(e), 'warn');
        if (first) setTimeout(() => this.refreshFull(true), 4000);
      }
    },

    toLogin() {
      window.Proctor.disarm();
      window.Proctor.setAllowLeave(true);
      store.set(TOKEN_KEY, null);
      location.replace('index.html');
    },

    load(r, sentAt) {
      if (r.tasks) {
        E.tasks = r.tasks;
        r.tasks.forEach(t => { if (!E.dirty1.has(t.id)) E.answers[t.id] = t.text || ''; });
      }
      if (r.questions) {
        E.qs = r.questions;
        r.questions.forEach(q => { if (!E.dirty2.has(q.n)) E.choices[q.n] = q.choice; });
      }
      this.applyState(r.state, sentAt || Date.now());
    },

    /* ---------- Күй ---------- */

    stageActive(k) {
      const s = E.st && E.st['stage' + k];
      return !!(s && s.start && !s.end);
    },

    activeStage() {
      if (this.stageActive(2)) return 2;
      if (this.stageActive(1)) return 1;
      return 0;
    },

    ctx() {
      const k = this.activeStage();
      return { stage: k || '', item: k === 1 ? 'task ' + (E.cur1 + 1) : k === 2 ? 'q ' + (E.cur2 + 1) : '' };
    },

    applyState(st, sentAt) {
      if (!st) return;
      E.st = st;
      E.offset = st.now - Date.now();
      const P = window.Proctor;
      const active = !!st.stage1.start && !st.stage2.end;

      if (st.halted) {
        P.disarm();
        P.showHalted();
      } else {
        if (P.halted) P.hideHalted();
        if (active) {
          if (!P.armed) P.arm();
          if (st.locked) {
            const sig = st.locks + ':' + (st.lockInfo ? st.lockInfo.at : '');
            if (!P.locked || E.shownLock !== sig) {
              P.showLock(st.lockInfo, st.locks, st.maxLocks);
              E.shownLock = sig;
            }
          } else if (P.locked) {
            if (!E.pendingLock && sentAt > E.lastLockAt) {
              P.hideLock();
              E.shownLock = '';
              toast(T('toast.unlocked'), 'ok');
              if (!P.isFs()) P.showFsGate();
            }
          } else if (!P.isFs()) {
            P.showFsGate();
          }
        } else {
          P.disarm();
          P.hideFsGate();
          if (P.locked) P.hideLock();
        }
      }
      this.chrome();
      this.render(false);
    },

    sig() {
      const s = E.st;
      if (!s) return '';
      return [E.view, s.stage1.start ? 1 : 0, s.stage1.end ? 1 : 0, s.stage2.start ? 1 : 0, s.stage2.end ? 1 : 0, E.tasks.length, E.qs.length, s.result ? 1 : 0].join('|');
    },

    /* ---------- Сервермен алмасу ---------- */

    serial(fn) {
      const p = E.queue.then(() => fn());
      E.queue = p.catch(() => {});
      return p;
    },

    async tick() {
      if (E.ticking || !E.st) return;
      E.ticking = true;
      try {
        await this.serial(async () => {
          if (E.pendingLock) await this.sendLock();
          const sentAt = Date.now();
          let r;
          if (this.stageActive(1) && E.dirty1.size) r = await this.save1();
          else if (this.stageActive(2) && E.dirty2.size) r = await this.save2();
          else r = await api('state');
          if (r && r.state) this.applyState(r.state, sentAt);
        });
      } catch (e) {
        this.handleErr(e);
      } finally {
        E.ticking = false;
      }
    },

    handleErr(e) {
      if (!e) return;
      if (e.code === 'no_session') return this.toLogin();
      if (e.code === 'deadline' || e.code === 'stage_closed') { E.dirty1.clear(); E.dirty2.clear(); this.refreshFull(); }
    },

    async save1() {
      const ids = Array.from(E.dirty1);
      if (!ids.length) return null;
      const vers = ids.map(id => E.ver1[id]);
      this.setSave('saving');
      try {
        const r = await api('save1', { answers: ids.map(id => ({ taskId: id, text: E.answers[id] || '' })) });
        ids.forEach((id, i) => { if (E.ver1[id] === vers[i]) E.dirty1.delete(id); });
        E.lastSaved = new Date();
        this.setSave(E.dirty1.size ? 'unsaved' : 'ok');
        return r;
      } catch (e) {
        this.setSave('err');
        throw e;
      }
    },

    async save2() {
      const ns = Array.from(E.dirty2);
      if (!ns.length) return null;
      const vers = ns.map(n => E.ver2[n]);
      const r = await api('save2', { answers: ns.map(n => ({ n: n, choice: E.choices[n] })) });
      ns.forEach((n, i) => { if (E.ver2[n] === vers[i]) E.dirty2.delete(n); });
      return r;
    },

    beaconSave() {
      if (this.stageActive(1) && E.dirty1.size) {
        beacon('save1', { answers: Array.from(E.dirty1).map(id => ({ taskId: id, text: E.answers[id] || '' })) });
      }
      if (this.stageActive(2) && E.dirty2.size) {
        beacon('save2', { answers: Array.from(E.dirty2).map(n => ({ n: n, choice: E.choices[n] })) });
      }
    },

    /* ---------- Прокторинг ---------- */

    onLock(type, detail) {
      const c = this.ctx();
      E.lastLockAt = Date.now();
      E.pendingLock = { type: type, detail: detail, stage: c.stage, item: c.item };
      if (type === 'unload') {
        this.beaconSave();
        beacon('violation', Object.assign({ severity: 'lock' }, E.pendingLock));
      }
      // Құлыптау сәтінде жауаптарды сақтап, бұзушылықты тіркеу
      this.serial(async () => {
        if (this.stageActive(1) && E.dirty1.size) await this.save1().catch(() => {});
        if (this.stageActive(2) && E.dirty2.size) await this.save2().catch(() => {});
        await this.sendLock();
      }).catch(e => this.handleErr(e));
    },

    async sendLock() {
      const v = E.pendingLock;
      if (!v) return;
      const sentAt = Date.now();
      const r = await api('violation', Object.assign({ severity: 'lock' }, v));
      if (E.pendingLock === v) E.pendingLock = null;
      this.applyState(r.state, sentAt);
    },

    async unlock(pin) {
      const sentAt = Date.now();
      const r = await this.serial(async () => {
        if (E.pendingLock) await this.sendLock();
        return api('unlock', { pin: pin });
      });
      this.applyState(r.state, sentAt);
    },

    /* ---------- Навигация ---------- */

    navAllowed(v) {
      const st = E.st;
      if (!st) return v === 'rules' || v === 'profile' || v === 'home';
      if (v === 'stage1' || v === 'stage2') return !!st.stage1.start;
      return true;
    },

    go(v, force) {
      if (!this.navAllowed(v) && !force) return;
      E.view = v;
      $$('.view').forEach(s => s.classList.toggle('hidden', s.dataset.section !== v));
      $$('.nav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
      this.chrome();
      this.render(true);
      window.scrollTo(0, 0);
    },

    render(force) {
      const sig = this.sig();
      if (!force && sig === E.sig) return;
      E.sig = sig;
      const v = E.view;
      if (v === 'home') this.renderHome();
      else if (v === 'profile') this.renderProfile();
      else if (v === 'rules') this.renderRules();
      else if (v === 'stage1') this.renderS1();
      else if (v === 'stage2') this.renderS2();
      icons();
    },

    chrome() {
      const st = E.st;
      const titles = { home: 'nav.home', profile: 'nav.profile', rules: 'nav.rules', stage1: 's1.title', stage2: 's2.title' };
      $('#pageTitle').textContent = T(titles[E.view] || 'nav.home');
      $$('.nav [data-view]').forEach(b => { b.disabled = !this.navAllowed(b.dataset.view); });
      if (!st) return;
      const parts = String(st.fullName || '').split(/\s+/);
      $('#userName').textContent = st.fullName;
      $('#userPos').textContent = personField(st, 'position');
      $('#avatar').textContent = ((parts[0] || '').charAt(0) + (parts[1] || '').charAt(0)).toUpperCase();
      const on = window.Proctor.armed;
      $('#proctorDot').classList.toggle('on', on);
      $('#proctorText').textContent = T(on ? 'top.proctorOn' : 'top.proctorOff');
      const done1 = this.tasksDone();
      $('#badge1').textContent = E.tasks.length ? done1 + '/' + E.tasks.length : '';
      $('#badge2').textContent = E.qs.length ? this.answeredCount() + '/' + E.qs.length : '';
      this.stats();
      this.clock();
    },

    tasksDone() {
      const min = E.st ? E.st.cfg.minWords : 0;
      return E.tasks.filter(t => countWords(E.answers[t.id]) >= min).length;
    },

    answeredCount() {
      return E.qs.filter(q => E.choices[q.n] >= 0).length;
    },

    stats() {
      const st = E.st;
      if (!st || E.view !== 'home') return;
      $('#helloText').textContent = T('home.hello', { name: (String(st.fullName).split(/\s+/)[1] || st.fullName) });
      $('#stTasks').textContent = this.tasksDone() + '/' + (E.tasks.length || 5);
      $('#stTests').textContent = this.answeredCount() + '/' + (E.qs.length || (st.cfg.testCountA + st.cfg.testCountB));
      $('#stWarns').textContent = st.locks + '/' + st.maxLocks;
      $('#stStage').textContent = T('pst.' + st.status);
    },

    remaining() {
      const k = this.activeStage();
      if (!k) return null;
      return E.st['stage' + k].deadline - (Date.now() + E.offset);
    },

    clock() {
      const left = this.remaining();
      const txt = fmtLeft(left);
      $('#timerText').textContent = txt;
      const tm = $('#timer');
      tm.classList.toggle('warn', left != null && left < 10 * 60000 && left >= 5 * 60000);
      tm.classList.toggle('danger', left != null && left < 5 * 60000);
      const stTime = $('#stTime');
      if (stTime) stTime.textContent = txt;
      if (left != null && left <= 0 && !E.finishing && !(E.st && E.st.halted)) {
        const k = this.activeStage();
        if (k === 1) this.finish1(true);
        else if (k === 2) this.finish2(true);
      }
    },

    setSave(state) {
      E.saveState = state;
      const el = $('#saveState');
      if (!el) return;
      el.className = 'save-state';
      if (state === 'ok') {
        el.classList.add('ok');
        el.innerHTML = '<i data-lucide="check"></i>' + esc(T('s1.saved', { t: hhmm(E.lastSaved || new Date()) }));
      } else if (state === 'saving') {
        el.innerHTML = '<i data-lucide="refresh-cw"></i>' + esc(T('s1.saving'));
      } else if (state === 'err') {
        el.classList.add('err');
        el.innerHTML = '<i data-lucide="triangle-alert"></i>' + esc(T('s1.saveErr'));
      } else if (state === 'unsaved') {
        el.innerHTML = '<i data-lucide="clock"></i>' + esc(T('s1.unsaved'));
      } else {
        el.innerHTML = '';
      }
      icons();
    },

    /* ---------- Басты бет / Профиль / Ережелер ---------- */

    renderHome() {
      const st = E.st;
      const box = $('#homeActions');
      if (!st) { box.innerHTML = ''; return; }
      let html = '';
      if (!st.stage1.start) html = '<button class="btn btn-primary" data-go="rules"><i data-lucide="shield-check"></i>' + esc(T('home.goRules')) + '</button>';
      else if (!st.stage1.end) html = '<button class="btn btn-primary" data-go="stage1"><i data-lucide="pen-line"></i>' + esc(T('home.go1')) + '</button>';
      else if (!st.stage2.end) html = '<button class="btn btn-primary" data-go="stage2"><i data-lucide="clipboard-check"></i>' + esc(T('home.go2')) + '</button>';
      else html = '<button class="btn btn-success" data-go="stage2"><i data-lucide="trophy"></i>' + esc(T('home.done')) + '</button>';
      box.innerHTML = html;
      $$('[data-go]', box).forEach(b => b.addEventListener('click', () => this.go(b.dataset.go)));
      this.stats();
    },

    renderProfile() {
      const st = E.st;
      if (!st) return;
      const row = (icon, color, k, v) =>
        '<div class="info-row"><span class="chip sm ' + color + '"><i data-lucide="' + icon + '"></i></span><div><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div></div>';
      $('#profileGrid').innerHTML =
        row('user', 'c-purple', T('profile.name'), st.fullName) +
        row('layout-dashboard', 'c-blue', T('f.dept'), personField(st, 'dept')) +
        row('pen-line', 'c-green', T('f.pos'), personField(st, 'position')) +
        row('book-open', 'c-amber', T('f.org'), T('app.org')) +
        row('clipboard-check', 'c-pink', T('profile.block'), T('block.' + st.block)) +
        row('calendar', 'c-blue', T('profile.dates'), T('app.dates'));
    },

    renderRules() {
      const st = E.st;
      const cfg = st ? st.cfg : { stage1Minutes: '—', stage2Minutes: '—', cameraEnabled: false };
      $('#rulesSt1').textContent = T('rules.st1', { m: cfg.stage1Minutes });
      $('#rulesSt2').textContent = T('rules.st2', { m: cfg.stage2Minutes });
      const items = [
        ['monitor', 'c-blue', 'rules.r1'], ['triangle-alert', 'c-pink', 'rules.r2'], ['lock', 'c-pink', 'rules.r3'],
        ['shield-check', 'c-purple', 'rules.r4'], ['user', 'c-blue', 'rules.r5'], ['ban', 'c-amber', 'rules.r6'],
        ['monitor', 'c-amber', 'rules.r7'], ['clock', 'c-green', 'rules.r8']
      ];
      if (cfg.cameraEnabled) items.push(['video', 'c-purple', 'rules.r9']);
      $('#rulesList').innerHTML = items.map(x =>
        '<li><span class="chip ' + x[1] + '"><i data-lucide="' + x[0] + '"></i></span><span>' +
        esc(T(x[2], { max: st ? st.maxLocks : 3 })) + '</span></li>').join('');
      const started = !!(st && st.stage1.start);
      $('#startArea').classList.toggle('hidden', started);
      $('#startedNote').classList.toggle('hidden', !started);
      $('#startBtn').disabled = !$('#agreeBox').checked;
    },

    async start() {
      const errBox = $('#startError');
      const fail = msg => { errBox.querySelector('span').textContent = msg; errBox.classList.remove('hidden'); };
      errBox.classList.add('hidden');
      if (!$('#agreeBox').checked) return;
      if (window.Proctor.hasSecondScreen()) return fail(T('rules.monitor'));
      const btn = $('#startBtn');
      btn.disabled = true;
      const label = btn.querySelector('span');
      label.textContent = T('rules.starting');
      try {
        const fsOk = await window.Proctor.enterFullscreen();
        if (!fsOk) return fail(T('rules.fsFail'));
        if (E.st && E.st.cfg.cameraEnabled) {
          const camOk = await window.Proctor.startCamera();
          if (!camOk) { window.Proctor.exitFullscreen(); return fail(T('rules.cameraFail')); }
        }
        const sentAt = Date.now();
        const r = await this.serial(() => api('start1', { agree: true }));
        this.load(r, sentAt);
        E.cur1 = 0;
        this.go('stage1');
      } catch (e) {
        window.Proctor.exitFullscreen();
        fail(errText(e));
      } finally {
        btn.disabled = !$('#agreeBox').checked;
        label.textContent = T('rules.start');
      }
    },

    /* ---------- 1-кезең ---------- */

    renderS1() {
      const st = E.st;
      const body = $('#s1Body');
      if (!st || !st.stage1.start) {
        body.innerHTML = this.centerCard('lock', 'c-blue', T('nav.stage1'), T('s1.notStarted'));
        return;
      }
      if (st.stage1.end) {
        body.innerHTML = this.centerCard('circle-check', 'c-green', T('s1.done'), T('s1.doneText'),
          st.stage2.end ? '' : '<button class="btn btn-primary" id="toS2"><i data-lucide="clipboard-check"></i>' + esc(T('home.go2')) + '</button>');
        const b = $('#toS2');
        if (b) b.addEventListener('click', () => this.go('stage2'));
        return;
      }
      if (!E.tasks.length) { body.innerHTML = ''; return; }
      if (E.cur1 >= E.tasks.length) E.cur1 = 0;
      const t = E.tasks[E.cur1];
      const lang = window.I18n.lang;
      const cfg = st.cfg;
      const kind = t.kind === 'prof' ? T('s1.prof') : T('s1.gen');

      body.innerHTML =
        '<div class="card card-pad" style="margin-bottom:20px"><div class="stepper" id="stepper"></div></div>' +
        '<div class="card card-pad">' +
          '<div class="card-head"><span class="chip sm ' + (t.kind === 'prof' ? 'c-purple' : 'c-green') + '"><i data-lucide="' + (t.kind === 'prof' ? 'clipboard-check' : 'pen-line') + '"></i></span>' +
          '<h3>' + esc(T('s1.task', { n: E.cur1 + 1 })) + ' · ' + esc(kind) + '</h3>' +
          '<span class="pill blue">' + esc(T('s1.min', { min: cfg.minWords })) + '</span></div>' +
          '<div class="task-text">' + esc(lang === 'ru' ? t.ru : t.kz) + '</div>' +
          '<label class="small muted" for="ans">' + esc(T('s1.answer')) + '</label>' +
          '<textarea class="answer" id="ans" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" placeholder="' + esc(T('s1.ph')) + '"></textarea>' +
          '<div class="answer-meta"><span class="counter" id="ctr"></span><span class="save-state" id="saveState"></span></div>' +
          '<div class="nav-row">' +
            '<button class="btn btn-outline" id="prev1"><i data-lucide="chevron-left"></i>' + esc(T('s1.prev')) + '</button>' +
            '<button class="btn btn-outline" id="next1">' + esc(T('s1.next')) + '<i data-lucide="chevron-right"></i></button>' +
            '<span class="spacer"></span><span class="hint" id="finHint"></span>' +
            '<button class="btn btn-primary" id="fin1"><i data-lucide="send"></i>' + esc(T('s1.finish')) + '</button>' +
          '</div>' +
        '</div>';

      const ta = $('#ans');
      ta.value = E.answers[t.id] || '';
      E.lastValid = ta.value;
      ta.addEventListener('beforeinput', () => { E.caret = ta.selectionStart; });
      ta.addEventListener('input', () => {
        if (countWords(ta.value) > cfg.wordLimit) {
          // Сөз шегінен асқанда жазу тоқтайды
          ta.value = E.lastValid;
          ta.selectionStart = ta.selectionEnd = Math.min(E.caret, ta.value.length);
          toast(T('s1.limit'), 'warn');
        } else {
          E.lastValid = ta.value;
        }
        if (E.answers[t.id] !== ta.value) {
          E.answers[t.id] = ta.value;
          E.ver1[t.id] = (E.ver1[t.id] || 0) + 1;
          E.dirty1.add(t.id);
          this.setSave('unsaved');
        }
        this.updateS1();
      });
      $('#prev1').addEventListener('click', () => this.goTask(E.cur1 - 1));
      $('#next1').addEventListener('click', () => this.goTask(E.cur1 + 1));
      $('#fin1').addEventListener('click', () => this.finish1(false));
      $('#prev1').disabled = E.cur1 === 0;
      $('#next1').disabled = E.cur1 === E.tasks.length - 1;
      this.updateS1();
      this.setSave(E.dirty1.size ? 'unsaved' : (E.lastSaved ? 'ok' : ''));
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    },

    goTask(i) {
      if (i < 0 || i >= E.tasks.length) return;
      E.cur1 = i;
      this.render(true);
    },

    updateS1() {
      const st = E.st;
      const cfg = st.cfg;
      const t = E.tasks[E.cur1];
      const text = E.answers[t.id] || '';
      const w = countWords(text);
      const ctr = $('#ctr');
      if (ctr) {
        ctr.textContent = T('s1.counter', { w: w, max: cfg.wordLimit, c: text.length });
        ctr.className = 'counter' + (w >= cfg.wordLimit ? ' over' : w >= cfg.minWords ? ' ok' : '');
      }
      const stepper = $('#stepper');
      if (stepper) {
        stepper.innerHTML = E.tasks.map((x, i) => {
          const done = countWords(E.answers[x.id]) >= cfg.minWords;
          return '<button class="step' + (i === E.cur1 ? ' active' : '') + (done ? ' done' : '') + '" data-i="' + i + '">' +
            '<span class="num">' + (done && i !== E.cur1 ? '✓' : i + 1) + '</span>' +
            '<span><span class="k">' + esc(x.kind === 'prof' ? T('s1.prof') : T('s1.gen')) + '</span><br>' + esc(T('s1.task', { n: i + 1 })) + '</span></button>';
        }).join('');
        $$('.step', stepper).forEach(b => b.addEventListener('click', () => this.goTask(Number(b.dataset.i))));
      }
      const all = this.tasksDone() === E.tasks.length;
      const fin = $('#fin1');
      if (fin) fin.disabled = !all;
      const hint = $('#finHint');
      if (hint) hint.textContent = all ? '' : T('s1.finishHint', { min: cfg.minWords });
      $('#badge1').textContent = this.tasksDone() + '/' + E.tasks.length;
    },

    async finish1(auto) {
      if (E.finishing) return;
      if (!auto) {
        const ok = await modal({ title: T('s1.confirmTitle'), text: T('s1.confirmText'), ok: T('s1.finish') });
        if (!ok) return;
      }
      E.finishing = true;
      try {
        const answers = E.tasks.map(t => ({ taskId: t.id, text: E.answers[t.id] || '' }));
        const sentAt = Date.now();
        const r = await this.serial(() => api('finish1', { answers: answers }));
        E.dirty1.clear();
        this.applyState(r.state, sentAt);
        this.render(true);
        if (auto) toast(T('s1.timeUp'), 'warn');
      } catch (e) {
        toast(errText(e), 'warn');
        this.handleErr(e);
      } finally {
        E.finishing = false;
      }
    },

    /* ---------- 2-кезең ---------- */

    renderS2() {
      const st = E.st;
      const body = $('#s2Body');
      if (!st) return;
      if (!st.stage1.end) {
        body.innerHTML = this.centerCard('lock', 'c-blue', T('s2.title'), T('s2.locked'));
        return;
      }
      if (!st.stage2.start) {
        body.innerHTML = this.centerCard('clipboard-check', 'c-purple', T('s2.title'), T('s2.intro'),
          '<p>' + esc(T('s2.introRules')) + '</p>' +
          '<div class="result-box"><span class="pill blue"><i data-lucide="clock"></i>' + esc(T('s2.introMeta', { m: st.cfg.stage2Minutes })) + '</span></div><br>' +
          '<button class="btn btn-primary" id="start2"><i data-lucide="clipboard-check"></i>' + esc(T('s2.start')) + '</button>');
        $('#start2').addEventListener('click', e => this.start2(e.currentTarget));
        return;
      }
      if (st.stage2.end) {
        const res = st.result
          ? '<div class="result-box"><span class="pill blue">' + esc(T('s2.result', { a: st.result.scoreA, ta: st.result.totalA, b: st.result.scoreB, tb: st.result.totalB })) + '</span></div>'
          : '<p>' + esc(T('s2.resultHidden')) + '</p>';
        body.innerHTML = this.centerCard('trophy', 'c-green', T('done.title'), T('done.text'), res);
        return;
      }
      if (!E.qs.length) { body.innerHTML = ''; return; }
      if (E.cur2 >= E.qs.length) E.cur2 = 0;
      const q = E.qs[E.cur2];
      const lang = window.I18n.lang;
      const flagged = E.flags.has(q.n);

      body.innerHTML =
        '<div class="test-wrap">' +
          '<div class="card card-pad">' +
            '<div class="q-head"><span class="pill ' + (q.part === 'B' ? 'purple' : 'blue') + '">' + esc(T(q.part === 'B' ? 's2.partB' : 's2.partA')) + '</span>' +
            '<span class="small muted">' + esc(T('s2.q', { n: E.cur2 + 1, total: E.qs.length })) + '</span><span class="spacer"></span>' +
            '<button class="btn btn-outline btn-sm flag-btn' + (flagged ? ' on' : '') + '" id="flagBtn"><i data-lucide="flag"></i>' + esc(T('s2.flag')) + '</button></div>' +
            '<div class="q-text">' + esc(lang === 'ru' ? q.ru : q.kz) + '</div>' +
            '<div class="options">' + q.options.map((o, i) =>
              '<button class="option' + (E.choices[q.n] === i ? ' selected' : '') + '" data-i="' + i + '"><span class="letter">' + LETTERS.charAt(i) + '</span><span>' + esc(lang === 'ru' ? o.ru : o.kz) + '</span></button>').join('') +
            '</div>' +
            '<div class="nav-row">' +
              '<button class="btn btn-outline" id="prev2"><i data-lucide="chevron-left"></i>' + esc(T('s2.prev')) + '</button>' +
              '<button class="btn btn-outline" id="next2">' + esc(T('s2.next')) + '<i data-lucide="chevron-right"></i></button>' +
              '<span class="spacer"></span>' +
              '<button class="btn btn-primary" id="fin2"><i data-lucide="send"></i>' + esc(T('s2.finish')) + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="card card-pad" id="qGridCard"></div>' +
        '</div>';

      $$('.option', body).forEach(b => b.addEventListener('click', () => this.choose(q.n, Number(b.dataset.i))));
      $('#flagBtn').addEventListener('click', () => {
        if (E.flags.has(q.n)) E.flags.delete(q.n); else E.flags.add(q.n);
        store.set('nlrk_flags', JSON.stringify(Array.from(E.flags)));
        $('#flagBtn').classList.toggle('on', E.flags.has(q.n));
        this.renderGrid();
      });
      $('#prev2').addEventListener('click', () => this.goQ(E.cur2 - 1));
      $('#next2').addEventListener('click', () => this.goQ(E.cur2 + 1));
      $('#fin2').addEventListener('click', () => this.finish2(false));
      $('#prev2').disabled = E.cur2 === 0;
      $('#next2').disabled = E.cur2 === E.qs.length - 1;
      this.renderGrid();
    },

    renderGrid() {
      const card = $('#qGridCard');
      if (!card) return;
      const cell = (q, i) => {
        const cls = ['q-cell'];
        if (E.choices[q.n] >= 0) cls.push('answered');
        if (E.flags.has(q.n)) cls.push('flagged');
        if (i === E.cur2) cls.push('current');
        return '<button class="' + cls.join(' ') + '" data-i="' + i + '">' + (i + 1) + '</button>';
      };
      const sec = part => {
        const items = E.qs.map((q, i) => [q, i]).filter(x => (x[0].part === 'B' ? 'B' : 'A') === part);
        if (!items.length) return '';
        return '<div class="q-grid-title">' + esc(T(part === 'B' ? 's2.partB' : 's2.partA')) + '</div>' +
          '<div class="q-grid">' + items.map(x => cell(x[0], x[1])).join('') + '</div>';
      };
      card.innerHTML = sec('A') + sec('B') +
        '<div class="legend">' +
          '<span><i style="background:var(--primary);border-color:var(--primary)"></i>' + esc(T('s2.answered')) + '</span>' +
          '<span><i style="background:var(--amber-bg);border-color:var(--amber)"></i>' + esc(T('s2.flagged')) + '</span>' +
          '<span><i></i>' + esc(T('s2.empty')) + '</span>' +
        '</div>';
      $$('.q-cell', card).forEach(b => b.addEventListener('click', () => this.goQ(Number(b.dataset.i))));
      $('#badge2').textContent = this.answeredCount() + '/' + E.qs.length;
    },

    goQ(i) {
      if (i < 0 || i >= E.qs.length) return;
      E.cur2 = i;
      this.render(true);
    },

    choose(n, i) {
      E.choices[n] = i;
      E.ver2[n] = (E.ver2[n] || 0) + 1;
      E.dirty2.add(n);
      $$('#s2Body .option').forEach(b => b.classList.toggle('selected', Number(b.dataset.i) === i));
      this.renderGrid();
      clearTimeout(E.s2timer);
      E.s2timer = setTimeout(() => {
        this.serial(() => this.save2()).catch(e => this.handleErr(e));
      }, 2000);
    },

    async start2(btn) {
      btn.disabled = true;
      try {
        const sentAt = Date.now();
        const r = await this.serial(() => api('start2'));
        this.load(r, sentAt);
        E.cur2 = 0;
        this.render(true);
      } catch (e) {
        toast(errText(e), 'warn');
        btn.disabled = false;
      }
    },

    async finish2(auto) {
      if (E.finishing) return;
      if (!auto) {
        const left = E.qs.length - this.answeredCount();
        const ok = await modal({ title: T('s2.confirmTitle'), text: T('s2.confirmText', { n: left }), ok: T('s2.finish') });
        if (!ok) return;
      }
      E.finishing = true;
      clearTimeout(E.s2timer);
      try {
        const answers = E.qs.map(q => ({ n: q.n, choice: E.choices[q.n] == null ? -1 : E.choices[q.n] }));
        const sentAt = Date.now();
        const r = await this.serial(() => api('finish2', { answers: answers }));
        E.dirty2.clear();
        this.applyState(r.state, sentAt);
        window.Proctor.exitFullscreen();
        window.Proctor.stopCamera();
        this.render(true);
        if (auto) toast(T('s2.timeUp'), 'warn');
      } catch (e) {
        toast(errText(e), 'warn');
        this.handleErr(e);
      } finally {
        E.finishing = false;
      }
    },

    centerCard(icon, color, title, text, extra) {
      return '<div class="card center-card"><div class="chip lg ' + color + '"><i data-lucide="' + icon + '"></i></div>' +
        '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' + (extra || '') + '</div>';
    },

    /* ---------- Шығу ---------- */

    async exit() {
      const st = E.st;
      if (st && st.stage1.start && !st.stage2.end) {
        await modal({ title: T('nav.exit'), text: T('exit.notDone'), ok: T('btn.ok'), noCancel: true });
        return;
      }
      const ok = await modal({ title: T('nav.exit'), text: T('exit.confirm'), ok: T('btn.exit') });
      if (!ok) return;
      try { await api('logout'); } catch (e) { /* */ }
      window.Proctor.exitFullscreen();
      window.Proctor.stopCamera();
      this.toLogin();
    }
  };

  /* ============================ Іске қосу ================================== */

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    window.I18n.apply();
    $$('.lang-switch button').forEach(b => b.addEventListener('click', () => window.I18n.set(b.dataset.lang)));
    icons();
    if (!isDesktop()) {
      const mb = $('#mobileBlock');
      if (mb) { mb.classList.remove('hidden'); return; }
    }
    if (page === 'login') Login.init();
    else if (page === 'exam') Exam.init();
  });
})();
