/* =============================================================================
 * Прокторинг және экранды құлыптау
 *
 * ШЕКТЕУ ТУРАЛЫ ЕСКЕРТУ:
 * Браузер компьютердегі басқа бағдарламаларды толық көре алмайды және екінші
 * құрылғыны (телефонды) байқамайды. Мұнда тек браузер беретін сигналдар
 * (қойынды жасырылуы, фокус, толық экран, терезе өлшемі, пернелер) бақыланады.
 * Сондықтан платформа залдағы тірі бақылаумен (проктормен) бірге қолданылады.
 * Мүмкіндік болса, компьютерлерде Safe Exam Browser немесе Chrome kiosk режимі
 * қолданылады.
 * ========================================================================== */
(function () {
  'use strict';

  const T = (k, v) => window.I18n.t(k, v);
  const el = id => document.getElementById(id);

  let opts = {};
  let armed = false;        // аттестация жүріп жатыр, бақылау қосулы
  let locked = false;       // құлып экраны көрсетіліп тұр
  let halted = false;       // сессия тоқтатылған
  let wasFs = false;
  let base = { w: 0, h: 0 };
  let blurTimer = null;
  let allowLeave = false;
  let pageHideSent = false;
  let camStream = null;
  let lastLock = null;      // { type, at, n, max }
  const warnQueue = {};

  const isFs = () => !!document.fullscreenElement;

  function hasSecondScreen() {
    return !!(window.screen && window.screen.isExtended === true);
  }

  /* ---------- Бұзушылықтар ---------- */

  function trigger(type, detail) {
    if (!armed || locked || halted) return;
    locked = true;
    clearTimeout(blurTimer);
    const predicted = opts.getLocks ? opts.getLocks() + 1 : 1;
    showLock({ type: type, at: Date.now() }, predicted, opts.getMaxLocks ? opts.getMaxLocks() : 3);
    if (opts.onLock) opts.onLock(type, detail || '');
  }

  // Құлыптамайтын, бірақ тіркелетін әрекеттер
  function warn(type, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!armed) return;
    warnQueue[type] = (warnQueue[type] || 0) + 1;
    if (window.App) window.App.toast(T('toast.blocked'), 'warn');
  }

  function flushWarns() {
    Object.keys(warnQueue).forEach(type => {
      const n = warnQueue[type];
      if (!n) return;
      delete warnQueue[type];
      if (opts.onWarn) opts.onWarn(type, n);
    });
  }

  /* ---------- Оқиғаларды тыңдау ---------- */

  function bind() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') trigger('hidden');
    });

    window.addEventListener('blur', () => {
      if (!armed || locked) return;
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => { if (!document.hasFocus()) trigger('blur'); }, 1000);
    });
    window.addEventListener('focus', () => clearTimeout(blurTimer));

    document.addEventListener('fullscreenchange', () => {
      if (isFs()) {
        wasFs = true;
        setTimeout(() => { base = { w: window.innerWidth, h: window.innerHeight }; }, 600);
        hideFsGate();
      } else if (wasFs) {
        wasFs = false;
        trigger('fullscreen');
        if (armed && !locked && !halted) showFsGate();
      }
    });

    window.addEventListener('resize', () => {
      if (!armed || locked || !base.w) return;
      if (window.innerWidth < base.w * 0.8 || window.innerHeight < base.h * 0.8) trigger('resize');
    });

    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey;
      const c = e.code;
      const devtools = e.key === 'F12' ||
        (ctrl && e.shiftKey && (c === 'KeyI' || c === 'KeyJ' || c === 'KeyC')) ||
        (e.metaKey && e.altKey && (c === 'KeyI' || c === 'KeyJ' || c === 'KeyC')) ||
        (ctrl && c === 'KeyU');
      if (devtools) { e.preventDefault(); e.stopPropagation(); trigger('devtools'); return; }
      if (e.key === 'F5' || (ctrl && c === 'KeyR')) {
        e.preventDefault();
        trigger('unload', 'reload-key');
        return;
      }
      if (ctrl && c === 'KeyP') return warn('print', e);
      if (ctrl && c === 'KeyS') return warn('save', e);
    }, true);

    document.addEventListener('keyup', e => {
      if (e.key === 'PrintScreen') {
        warn('printscreen');
        try { navigator.clipboard.writeText(''); } catch (err) { /* */ }
      }
    }, true);

    ['copy', 'cut', 'paste'].forEach(ev => document.addEventListener(ev, e => warn(ev, e), true));
    document.addEventListener('contextmenu', e => warn('contextmenu', e), true);
    document.addEventListener('dragstart', e => warn('drag', e), true);
    document.addEventListener('drop', e => warn('drag', e), true);
    document.addEventListener('dragover', e => e.preventDefault(), true);

    // Платформада сыртқы сілтеме жоқ: кез келген <a> басуы тоқтатылады
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a');
      if (a) { e.preventDefault(); warn('link'); }
    }, true);
    window.open = function () { warn('link'); return null; };
    window.print = function () { warn('print'); };

    window.addEventListener('beforeunload', e => {
      if (!armed || allowLeave) return;
      trigger('unload');
      e.preventDefault();
      e.returnValue = '';
    });
    window.addEventListener('pagehide', () => {
      if (!armed || allowLeave || pageHideSent) return;
      pageHideSent = true;
      if (opts.onPageHide) opts.onPageHide();
    });

    if (window.screen && 'isExtended' in window.screen && window.screen.addEventListener) {
      window.screen.addEventListener('change', () => { if (hasSecondScreen()) trigger('monitor'); });
    }

    setInterval(() => {
      if (!armed) return;
      if (hasSecondScreen()) trigger('monitor');
      if (camStream && camStream.getVideoTracks().some(t => t.readyState === 'ended')) trigger('camera');
    }, 5000);
    setInterval(flushWarns, 10000);

    // PIN арқылы ашу
    el('pinForm').addEventListener('submit', async e => {
      e.preventDefault();
      const pin = el('pinInput').value.trim();
      if (!pin) return;
      const btn = el('pinBtn');
      btn.disabled = true;
      el('pinError').classList.add('hidden');
      try {
        await opts.onUnlock(pin);
      } catch (err) {
        el('pinError').querySelector('span').textContent = window.App.errText(err);
        el('pinError').classList.remove('hidden');
        el('pinInput').select();
      } finally {
        btn.disabled = false;
      }
    });
    el('pinInput').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });

    el('fsBtn').addEventListener('click', async () => {
      el('fsError').classList.add('hidden');
      const ok = await enterFullscreen();
      if (!ok) {
        el('fsError').querySelector('span').textContent = T('rules.fsFail');
        el('fsError').classList.remove('hidden');
        return;
      }
      if (opts.needCamera && opts.needCamera() && !camActive()) {
        const camOk = await startCamera();
        if (!camOk) {
          el('fsError').querySelector('span').textContent = T('rules.cameraFail');
          el('fsError').classList.remove('hidden');
          return;
        }
      }
      hideFsGate();
      if (opts.onFsRestored) opts.onFsRestored();
    });

    window.I18n.onChange(() => { if (lastLock) renderLock(); renderAlt(); });
  }

  /* ---------- Экрандар ---------- */

  function renderAlt() {
    el('lockAlt').textContent = window.I18n.tOther('lock.text');
    el('haltAlt').textContent = window.I18n.tOther('halt.text');
  }

  function renderLock() {
    const L = lastLock;
    el('lockType').textContent = T('v.' + L.type);
    el('lockTime').textContent = new Date(L.at).toLocaleTimeString('ru-RU');
    el('lockCount').textContent = T('lock.warn', { n: L.n, max: L.max });
  }

  function showLock(info, n, max) {
    locked = true;
    lastLock = { type: (info && info.type) || 'hidden', at: (info && info.at) || Date.now(), n: n, max: max };
    renderLock();
    renderAlt();
    el('fsOverlay').classList.add('hidden');
    el('lockOverlay').classList.remove('hidden');
    el('pinError').classList.add('hidden');
    setTimeout(() => { try { el('pinInput').focus(); } catch (e) { /* */ } }, 50);
  }

  function hideLock() {
    locked = false;
    lastLock = null;
    el('lockOverlay').classList.add('hidden');
    el('pinInput').value = '';
    el('pinError').classList.add('hidden');
  }

  function showHalted() {
    halted = true;
    locked = true;
    renderAlt();
    el('lockOverlay').classList.add('hidden');
    el('fsOverlay').classList.add('hidden');
    el('haltOverlay').classList.remove('hidden');
  }

  function hideHalted() {
    halted = false;
    locked = false;
    el('haltOverlay').classList.add('hidden');
  }

  function showFsGate() {
    if (isFs() || locked || halted) return;
    el('fsError').classList.add('hidden');
    el('fsOverlay').classList.remove('hidden');
  }

  function hideFsGate() { el('fsOverlay').classList.add('hidden'); }

  async function enterFullscreen() {
    if (isFs()) return true;
    try {
      // Браузер жауап бермей қалса, батырма қатып қалмауы үшін күту шегі
      await Promise.race([
        document.documentElement.requestFullscreen({ navigationUI: 'hide' }),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
      ]);
      wasFs = isFs();
      return wasFs;
    } catch (e) {
      return false;
    }
  }

  function exitFullscreen() {
    wasFs = false;
    if (isFs()) document.exitFullscreen().catch(() => {});
  }

  /* ---------- Веб-камера (Settings: cameraEnabled) ---------- */

  function camActive() {
    return !!camStream && camStream.getVideoTracks().some(t => t.readyState === 'live');
  }

  async function startCamera() {
    if (camActive()) return true;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      el('camVideo').srcObject = camStream;
      el('camBox').classList.remove('hidden');
      camStream.getVideoTracks().forEach(t => t.addEventListener('ended', () => trigger('camera')));
      return true;
    } catch (e) {
      return false;
    }
  }

  function stopCamera() {
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    camStream = null;
    el('camBox').classList.add('hidden');
  }

  /* ---------- Бір қойынды ---------- */

  function checkSingleTab() {
    return new Promise(resolve => {
      if (!('BroadcastChannel' in window)) return resolve(true);
      const ch = new BroadcastChannel('nlrk-attestation');
      const id = Math.random().toString(36).slice(2);
      let dup = false;
      ch.onmessage = e => {
        const m = e.data || {};
        if (m.id === id) return;
        if (m.t === 'hello' && !dup) ch.postMessage({ t: 'here', id: id });
        if (m.t === 'here') dup = true;
      };
      ch.postMessage({ t: 'hello', id: id });
      setTimeout(() => resolve(!dup), 500);
    });
  }

  window.Proctor = {
    setup(o) { opts = o || {}; bind(); },
    arm() { armed = true; pageHideSent = false; },
    disarm() { armed = false; clearTimeout(blurTimer); flushWarns(); },
    get armed() { return armed; },
    get locked() { return locked; },
    get halted() { return halted; },
    isFs: isFs,
    trigger: trigger,
    flushWarns: flushWarns,
    showLock: showLock,
    hideLock: hideLock,
    showHalted: showHalted,
    hideHalted: hideHalted,
    showFsGate: showFsGate,
    hideFsGate: hideFsGate,
    enterFullscreen: enterFullscreen,
    exitFullscreen: exitFullscreen,
    startCamera: startCamera,
    stopCamera: stopCamera,
    camActive: camActive,
    hasSecondScreen: hasSecondScreen,
    checkSingleTab: checkSingleTab,
    setAllowLeave(v) { allowLeave = !!v; }
  };
})();
