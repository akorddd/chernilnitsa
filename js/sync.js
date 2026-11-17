'use strict';
/* =========================================================
   Синхронизация между устройствами: облако аккаунта Claude
   Книга хранится в личном разделе db (data/users/<id>/), видна только вам.
   Устройство: манифест + части (главы режутся на куски, чтобы влезть в лимит документа).
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const ST_KEY = 'chernilnitsa.sync';
  const BK_KEY = 'chernilnitsa.before-sync';
  const DEV = App.uid();
  const PART = 40000;

  const S = (App.Sync = {
    db: null,
    base: '',
    ready: false,
    remote: null, // последний подтверждённый манифест из облака
    cache: {}, // hash -> строка блоба
    pushing: false,
    again: false,
    applying: false,
    conflict: null,
    status: 'off',
  });

  /* ---------- Состояние этого устройства ---------- */
  const loadState = () => {
    try {
      const s = JSON.parse(App.lsGet(ST_KEY) || 'null');
      if (s && typeof s === 'object') return s;
    } catch (e) {}
    return null;
  };
  let state = loadState();
  const saveState = () => App.lsSet(ST_KEY, JSON.stringify(state));

  /* ---------- Разбивка данных на блобы ---------- */
  const hash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36) + '.' + s.length.toString(36);
  };
  const split = (d) => {
    const meta = Object.assign({}, d, {
      book: Object.assign({}, d.book, {
        chapters: d.book.chapters.map((c) => {
          const r = Object.assign({}, c);
          delete r.thesis;
          delete r.text;
          return r;
        }),
      }),
    });
    const out = { meta: JSON.stringify(meta) };
    d.book.chapters.forEach((c) => (out['c' + c.id] = JSON.stringify({ thesis: c.thesis, text: c.text })));
    return out;
  };
  const join = (blobs) => {
    const meta = JSON.parse(blobs.meta);
    meta.book.chapters = (meta.book.chapters || []).map((c) => Object.assign(c, JSON.parse(blobs['c' + c.id] || '{}')));
    return meta;
  };
  const hashes = (blobs) => {
    const o = {};
    for (const k in blobs) o[k] = hash(blobs[k]);
    return o;
  };
  const sameHashes = (a, b) => {
    const ka = Object.keys(a || {}),
      kb = Object.keys(b || {});
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  };
  const isEmpty = (d) =>
    !(d.book.title || '').trim() &&
    d.book.chapters.every((c) => !c.text.trim() && !c.thesis.trim()) &&
    ['characters', 'places', 'timeline', 'notes'].every((k) => !d[k].length);
  const bookWords = (d) => d.book.chapters.reduce((a, c) => a + App.words(c.text), 0);
  const isDirty = () => {
    if (!state) return !isEmpty(App.data);
    return !sameHashes(hashes(split(App.data)), state.hashes);
  };

  /* ---------- Строка состояния ---------- */
  const setStatus = (st) => {
    S.status = st;
    const el = App.$('.sb-sync');
    if (!el) return;
    el.classList.toggle('hidden', st === 'off' || App.mode !== 'real');
    el.className = el.className.replace(/\bs-\w+/g, '').trim() + ' s-' + st;
    App.$('.sync-txt', el).textContent = t('sync_' + st);
    el.title = t('sync_tip');
  };

  /* ---------- Отправка в облако ---------- */
  const fail = (e) => {
    console.error('sync', e);
    const code = (e && e.code) || '';
    setStatus(code === 'quota_exceeded' ? 'full' : 'err');
    if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled') {
      S.ready = false;
      return;
    }
    clearTimeout(S.retry);
    S.retry = setTimeout(() => S.push(), code === 'resource_exhausted' ? 30000 : 15000);
  };

  S.push = async () => {
    if (!S.ready || S.conflict || App.mode !== 'real' || S.applying) return;
    if (S.pushing) {
      S.again = true;
      return;
    }
    const remote = S.remote;
    // В облаке есть более новая версия с другого устройства — сначала решить, какую оставить
    if (remote && (!state || remote.rev !== state.rev) && remote.device !== DEV) return reconcile();
    const blobs = split(App.data);
    const hs = hashes(blobs);
    if (state && remote && remote.rev === state.rev && sameHashes(hs, state.hashes)) return setStatus('ok');
    S.pushing = true;
    setStatus('busy');
    try {
      const rev = Date.now();
      const old = (remote && remote.blobs) || {};
      const oldByHash = {};
      for (const k in old) oldByHash[old[k].h] = old[k];
      const nb = {};
      let n = 0;
      const prefix = 'p-' + rev.toString(36) + '-' + DEV.slice(0, 4) + '-';
      for (const k in blobs) {
        const h = hs[k];
        if (oldByHash[h]) {
          nb[k] = { h, ids: oldByHash[h].ids };
          continue;
        }
        const s = blobs[k];
        const ids = [];
        for (let i = 0; i < s.length || i === 0; i += PART) {
          const id = prefix + n++;
          await S.db.doc(S.base + id).set({ s: s.slice(i, i + PART) });
          ids.push(id);
        }
        nb[k] = { h, ids };
        S.cache[h] = s;
      }
      const man = { rev, device: DEV, blobs: nb, words: bookWords(App.data), chapters: App.data.book.chapters.length, title: App.data.book.title || '' };
      await S.db.doc(S.base + 'manifest').set(man);
      // Старые части, на которые больше никто не ссылается
      const keep = new Set();
      for (const k in nb) nb[k].ids.forEach((id) => keep.add(id));
      for (const k in old) for (const id of old[k].ids) if (!keep.has(id)) await S.db.doc(S.base + id).delete().catch(() => {});
      S.remote = man;
      state = { rev, hashes: hs, at: rev };
      saveState();
      setStatus(isDirty() ? 'busy' : 'ok');
    } catch (e) {
      S.pushing = false;
      return fail(e);
    }
    S.pushing = false;
    if (S.again || isDirty()) {
      S.again = false;
      schedule(800);
    }
  };

  let pushTimer = null,
    firstPending = 0;
  const schedule = (ms) => {
    if (!S.ready || App.mode !== 'real') return;
    const now = Date.now();
    if (!firstPending) firstPending = now;
    clearTimeout(pushTimer);
    // Не дольше 10 с без отправки, даже если вы печатаете без пауз
    const wait = Math.max(0, Math.min(ms == null ? 1500 : ms, firstPending + 10000 - now));
    pushTimer = setTimeout(() => {
      firstPending = 0;
      S.push();
    }, wait);
  };

  /* ---------- Загрузка из облака ---------- */
  const fetchBlobs = async (man) => {
    const out = {};
    for (const k in man.blobs) {
      const b = man.blobs[k];
      if (S.cache[b.h] != null) {
        out[k] = S.cache[b.h];
        continue;
      }
      const snaps = await Promise.all(b.ids.map((id) => S.db.doc(S.base + id).get()));
      if (snaps.some((x) => !x.exists)) throw { code: 'missing' };
      const s = snaps.map((x) => x.data().s || '').join('');
      S.cache[b.h] = s;
      out[k] = s;
    }
    return out;
  };

  const pull = async (man, tries) => {
    setStatus('busy');
    let blobs;
    try {
      blobs = await fetchBlobs(man);
    } catch (e) {
      if (e && e.code === 'missing' && (tries || 0) < 3) {
        // Другое устройство как раз сохраняет — берём свежий манифест и пробуем снова
        await new Promise((r) => setTimeout(r, 1500));
        const snap = await S.db.doc(S.base + 'manifest').get();
        if (snap.exists) {
          S.remote = snap.data();
          return pull(S.remote, (tries || 0) + 1);
        }
      }
      return fail(e);
    }
    if (S.remote && S.remote.rev !== man.rev) return; // пока качали, пришла ещё более новая
    apply(join(blobs), man);
    App.toast(t('sync_pulled'), 'ok');
  };

  const apply = (data, man) => {
    S.applying = true;
    try {
      App.data = App.normalize(data);
      App.saveNow();
    } finally {
      S.applying = false;
    }
    state = { rev: man.rev, hashes: hashes(split(App.data)), at: Date.now() };
    saveState();
    setStatus('ok');
    App.emit('data-reset');
  };

  /* ---------- Сверка: что новее, здесь или в облаке ---------- */
  let reconciling = false;
  const reconcile = async () => {
    if (!S.ready || App.mode !== 'real' || S.conflict || reconciling) return;
    reconciling = true;
    try {
      const man = S.remote;
      const dirty = isDirty();
      if (!man) {
        if (dirty || !isEmpty(App.data)) await S.push();
        else setStatus('ok');
        return;
      }
      if (state && man.rev === state.rev) {
        if (dirty) schedule(300);
        else setStatus('ok');
        return;
      }
      if (man.device === DEV) return;
      if (!dirty) return await pull(man);
      askConflict(man);
    } finally {
      reconciling = false;
    }
  };

  /* ---------- Две разные версии: спросить ---------- */
  const fmtWhen = (ms) =>
    new Date(ms).toLocaleString(App.lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  const askConflict = async (man) => {
    S.conflict = man;
    setStatus('conflict');
    const body = App.el(`<div>
      <p>${t('conflict_body')}</p>
      <label class="radio"><input type="radio" name="cv" value="remote" checked><span><b>${t('conflict_remote')}</b><br><small>${App.esc(
        t('conflict_remote_sub', { when: fmtWhen(man.rev), n: App.fmt(man.words || 0) })
      )}</small></span></label>
      <label class="radio"><input type="radio" name="cv" value="local"><span><b>${t('conflict_local')}</b><br><small>${App.esc(
        t('conflict_local_sub', { n: App.fmt(bookWords(App.data)) })
      )}</small></span></label>
      <p style="color:var(--text-dim);margin-top:12px">${t('conflict_note')}</p>
    </div>`);
    const v = await App.modal({
      title: t('conflict_title'),
      body,
      buttons: [
        { label: t('conflict_later'), value: null },
        { label: t('ok'), primary: true, value: (mb) => mb.querySelector('[name=cv]:checked').value },
      ],
    });
    if (!v) return; // отложено: значок в строке состояния откроет вопрос снова
    const latest = S.remote || man;
    if (v === 'remote') {
      App.lsSet(BK_KEY, JSON.stringify({ at: Date.now(), data: App.data }));
      S.conflict = null;
      await pull(latest);
    } else {
      setStatus('busy');
      try {
        const blobs = await fetchBlobs(latest);
        App.lsSet(BK_KEY, JSON.stringify({ at: Date.now(), data: join(blobs) }));
      } catch (e) {}
      state = { rev: latest.rev, hashes: {}, at: Date.now() };
      saveState();
      S.conflict = null;
      await S.push();
    }
    App.updateSyncMenu();
  };

  App.updateSyncMenu = () => {
    const b = App.$('[data-act="sync-undo"]');
    if (b) b.classList.toggle('hidden', !App.lsGet(BK_KEY));
  };

  S.undo = async () => {
    let bk = null;
    try {
      bk = JSON.parse(App.lsGet(BK_KEY) || 'null');
    } catch (e) {}
    if (!bk || !bk.data) return;
    if (!(await App.confirm(t('sync_undo_q', { when: fmtWhen(bk.at) }), t('restore_ok'), true))) return;
    const cur = App.data;
    App.data = App.normalize(bk.data);
    App.lsSet(BK_KEY, JSON.stringify({ at: Date.now(), data: cur }));
    App.saveNow();
    App.emit('data-reset');
    App.toast(t('restored'), 'ok');
  };

  /* ---------- События приложения ---------- */
  App.on('saved', () => {
    if (S.applying || App.mode !== 'real' || !S.ready) return;
    if (S.conflict) return;
    if (isDirty()) {
      setStatus('busy');
      schedule();
    }
  });
  App.on('data-reset', () => {
    if (S.applying) return;
    setStatus(S.status);
    if (App.mode === 'real') setTimeout(reconcile, 0);
  });
  App.on('lang', () => setStatus(S.status));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && S.ready && App.mode === 'real' && isDirty()) {
      clearTimeout(pushTimer);
      firstPending = 0;
      S.push();
    }
  });

  /* ---------- Подключение к облаку ---------- */
  S.start = async () => {
    const C = window.claude;
    if (!C || typeof C.use !== 'function') return setStatus('off');
    setStatus('busy');
    let db, user, uid;
    try {
      [db, user] = await Promise.all([C.use('db'), C.use('user')]);
      uid = user ? await user.id() : null;
    } catch (e) {
      db = null;
    }
    if (!db || !uid) return setStatus('off');
    S.db = db;
    S.base = 'data/users/' + uid + '/';
    S.ready = true;
    let confirmed = false;
    const slow = setTimeout(() => !confirmed && setStatus('err'), 10000);
    db.doc(S.base + 'manifest').onSnapshot(
      (snap) => {
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
        if (!confirmed) {
          confirmed = true;
          clearTimeout(slow);
        }
        const man = snap.exists ? snap.data() : null;
        if (man && S.remote && man.rev === S.remote.rev) return;
        S.remote = man;
        if (S.conflict && man && man.rev !== S.conflict.rev) S.conflict = man;
        if (!S.pushing && !S.conflict) reconcile();
      },
      (e) => {
        clearTimeout(slow);
        S.ready = false;
        console.error('sync', e);
        setStatus('err');
      }
    );
  };

  App.$('.sb-sync') &&
    App.$('.sb-sync').addEventListener('click', () => {
      if (S.conflict) askConflict(S.remote || S.conflict);
      else if (S.status === 'err' && S.ready) S.push();
    });
})();
