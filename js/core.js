'use strict';
/* =========================================================
   Чернильница — ядро: данные, хранение, события, утилиты
   ========================================================= */
(function () {
  const App = (window.App = {});

  /* ---------- Утилиты ---------- */
  App.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  App.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  App.$ = (s, r) => (r || document).querySelector(s);
  App.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  App.el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  App.debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  App.words = (s) => (String(s || '').match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;
  App.fmt = (n) => Number(n).toLocaleString(App.lang === 'en' ? 'en-US' : 'ru-RU');
  App.today = () => new Date().toISOString().slice(0, 10);
  App.safeName = (s) => (s || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'book';

  /* ---------- События ---------- */
  const handlers = {};
  App.on = (n, f) => (handlers[n] = handlers[n] || []).push(f);
  App.emit = (n, p) =>
    (handlers[n] || []).forEach((f) => {
      try {
        f(p);
      } catch (e) {
        console.error(e);
      }
    });

  /* ---------- Иконки (линейные, 24×24) ---------- */
  const IC = {
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
    note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    focus: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    reset: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    chev: '<polyline points="9 18 15 12 9 6"/>',
    up: '<polyline points="18 15 12 9 6 15"/>',
    down: '<polyline points="6 9 12 15 18 9"/>',
    arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    play: '<polygon points="6 4 20 12 6 20 6 4"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    beaker: '<path d="M9 3h6M10 3v6L4 20a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 20l-6-11V3"/>',
    cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.3"/><circle cx="17.5" cy="10.5" r="1.3"/><circle cx="8.5" cy="7.5" r="1.3"/><circle cx="6.5" cy="12.5" r="1.3"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.12a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
    lifebuoy: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>',
    bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    rain: '<line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>',
    waves: '<path d="M2 6c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  };
  App.VERSION = '1.5';
  App.icon = (n, cls) => `<svg class="i ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;

  /* ---------- Константы ---------- */
  App.COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'];
  App.STATUSES = ['thesis', 'draft', 'done'];
  App.TYPES = ['spell', 'grammar', 'style', 'question'];

  /* ---------- Хранение (память браузера) ---------- */
  const KEYS = { real: 'chernilnitsa.book', demo: 'chernilnitsa.demo', mode: 'chernilnitsa.mode', ui: 'chernilnitsa.ui' };
  App.lsGet = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  App.lsSet = (k, v) => {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch (e) {
      return false;
    }
  };

  App.blank = () => ({
    v: 1,
    book: { title: '', frontmatter: '', chapters: [] },
    characters: [],
    places: [],
    timeline: [],
    notes: [],
    dictionary: [],
    ignored: [],
    issues: [],
    unseen: false,
    settings: { checkLang: 'ru-RU', work: 25, rest: 5, fontSize: 18, font: 'serif', native: false, active: null, thesisOpen: true, thesisWidth: 360 },
  });

  App.newChapter = (title, idx) => ({
    id: App.uid(),
    title: title || '',
    status: 'thesis',
    color: App.COLORS[(idx || 0) % App.COLORS.length],
    thesis: '',
    text: '',
    thesisOpen: true,
  });

  const nl = (s) => String(s || '').replace(/\r\n?/g, '\n');
  App.normalize = (d) => {
    const base = App.blank();
    const out = Object.assign(base, d || {});
    out.book = Object.assign(App.blank().book, out.book || {});
    out.settings = Object.assign(App.blank().settings, out.settings || {});
    ['characters', 'places', 'timeline', 'notes', 'dictionary', 'ignored', 'issues'].forEach((k) => {
      if (!Array.isArray(out[k])) out[k] = [];
    });
    if (!Array.isArray(out.book.chapters)) out.book.chapters = [];
    if (!out.book.chapters.length) out.book.chapters.push(App.newChapter('1', 0));
    out.book.chapters.forEach((c, i) => {
      c.id = c.id || App.uid();
      c.title = c.title || '';
      c.thesis = nl(c.thesis);
      c.text = nl(c.text);
      if (!App.STATUSES.includes(c.status)) c.status = 'thesis';
      c.color = c.color || App.COLORS[i % App.COLORS.length];
      if (c.thesisOpen === undefined) c.thesisOpen = true;
    });
    if (!out.book.chapters.find((c) => c.id === out.settings.active)) out.settings.active = out.book.chapters[0].id;
    return out;
  };

  App.mode = App.lsGet(KEYS.mode) === 'demo' ? 'demo' : 'real';
  App.load = () => {
    const raw = App.lsGet(KEYS[App.mode]);
    let d = null;
    try {
      d = raw ? JSON.parse(raw) : null;
    } catch (e) {
      d = null;
    }
    if (!d && App.mode === 'demo') d = App.demoData();
    App.data = App.normalize(d);
  };

  let saveTimer = null;
  App.save = () => {
    App.emit('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(App.saveNow, 400);
  };
  App.saveNow = () => {
    clearTimeout(saveTimer);
    const ok = App.lsSet(KEYS[App.mode], JSON.stringify(App.data));
    App.emit(ok ? 'saved' : 'save-error');
    return ok;
  };
  window.addEventListener('beforeunload', () => App.saveNow());

  App.setMode = (m) => {
    App.saveNow();
    App.mode = m;
    App.lsSet(KEYS.mode, m);
    App.load();
    App.emit('data-reset');
  };
  App.resetDemo = () => {
    App.data = App.normalize(App.demoData());
    App.saveNow();
    App.emit('data-reset');
  };

  /* ---------- Язык интерфейса ---------- */
  App.lang = App.lsGet(KEYS.ui) === 'en' ? 'en' : 'ru';
  App.t = (k, vars) => {
    const dict = App.I18N[App.lang] || {};
    let s = dict[k] != null ? dict[k] : App.I18N.ru[k] != null ? App.I18N.ru[k] : k;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, n) => (vars[n] != null ? vars[n] : m));
    return s;
  };
  App.applyI18n = (root) => {
    App.$$('[data-i18n]', root).forEach((e) => (e.textContent = App.t(e.dataset.i18n)));
    App.$$('[data-i18n-ph]', root).forEach((e) => (e.placeholder = App.t(e.dataset.i18nPh)));
    App.$$('[data-i18n-title]', root).forEach((e) => (e.title = App.t(e.dataset.i18nTitle)));
  };
  App.setLang = (l) => {
    App.lang = l;
    App.lsSet(KEYS.ui, l);
    document.documentElement.lang = l;
    App.applyI18n(document);
    App.emit('lang');
  };

  /* ---------- Главы ---------- */
  App.chapter = (id) => App.data.book.chapters.find((c) => c.id === id);
  App.chapterIndex = (id) => App.data.book.chapters.findIndex((c) => c.id === id);
  App.chapterLabel = (c) => {
    const title = (c.title || '').trim();
    if (!title) return App.t('chapter_n', { n: App.chapterIndex(c.id) + 1 });
    if (/^\d+$/.test(title)) return App.t('chapter_n', { n: title });
    return title;
  };
  App.active = () => App.chapter(App.data.settings.active);

  /* ---------- Правки: сдвиг при редактировании ---------- */
  const WORDY = /[\p{L}\p{N}]/u;
  // Текст поля изменился: [start, oldEnd) заменили на ins (удалили del).
  // Правки до изменения остаются, после — сдвигаются, задетые — удаляются.
  App.shiftIssues = (chId, field, start, oldEnd, ins, del) => {
    const delta = ins.length - (oldEnd - start);
    const touchEnd = WORDY.test(ins.charAt(0)) || WORDY.test(del.charAt(0));
    const touchStart = WORDY.test(ins.charAt(ins.length - 1)) || WORDY.test(del.charAt(del.length - 1));
    App.data.issues = App.data.issues.filter((is) => {
      if (is.ch !== chId || is.field !== field) return true;
      const end = is.offset + is.length;
      if (end < start || (end === start && !touchEnd)) return true;
      if (is.offset > oldEnd || (is.offset === oldEnd && !touchStart)) {
        is.offset += delta;
        return true;
      }
      return false;
    });
  };
  App.diff = (a, b) => {
    let s = 0;
    const min = Math.min(a.length, b.length);
    while (s < min && a.charCodeAt(s) === b.charCodeAt(s)) s++;
    let ea = a.length,
      eb = b.length;
    while (ea > s && eb > s && a.charCodeAt(ea - 1) === b.charCodeAt(eb - 1)) {
      ea--;
      eb--;
    }
    return { start: s, oldEnd: ea, ins: b.slice(s, eb), del: a.slice(s, ea) };
  };
  // Программная правка текста (из вкладки «Правки», синонимов, замены)
  App.applyEdit = (chId, field, start, end, str) => {
    const c = App.chapter(chId);
    if (!c) return;
    const old = c[field];
    c[field] = old.slice(0, start) + str + old.slice(end);
    App.shiftIssues(chId, field, start, end, str, old.slice(start, end));
    App.save();
    App.emit('text-changed', { chId, field });
  };

  App.ignoreKey = (is) => [is.ch, is.rule, (is.text || '').toLowerCase()].join('|');
  App.replaceIssues = (chId, field, s, e, source, list) => {
    App.data.issues = App.data.issues.filter(
      (is) => !(is.ch === chId && is.field === field && is.source === source && is.offset >= s && is.offset + is.length <= e)
    );
    const ign = new Set(App.data.ignored);
    const fresh = list.filter((is) => !ign.has(App.ignoreKey(is)));
    App.data.issues.push(...fresh);
    if (fresh.length && App.route !== 'pravki') App.data.unseen = true;
    App.save();
    App.emit('issues');
    return fresh.length;
  };
  App.removeIssue = (id) => {
    App.data.issues = App.data.issues.filter((x) => x.id !== id);
  };

  App.Issues = {
    apply(is, value, hl) {
      const c = App.chapter(is.ch);
      if (!c) return;
      if (c[is.field].substr(is.offset, is.length) !== is.text) {
        App.removeIssue(is.id);
        App.emit('issues');
        App.toast(App.t('stale'), 'err');
        return;
      }
      if (hl && hl.ch && hl.ch.id === is.ch && hl.field === is.field && hl.isVisible()) {
        // Через execCommand, чтобы работал Ctrl+Z
        const ta = hl.ta;
        ta.focus();
        ta.setSelectionRange(is.offset, is.offset + is.length);
        const ok = value === '' ? document.execCommand('delete') : document.execCommand('insertText', false, value);
        if (!ok) {
          ta.setRangeText(value, is.offset, is.offset + is.length, 'end');
          hl.onInput();
        }
      } else {
        App.applyEdit(is.ch, is.field, is.offset, is.offset + is.length, value);
      }
      App.removeIssue(is.id);
      App.save();
      App.emit('issues');
    },
    skip(is) {
      const k = App.ignoreKey(is);
      if (!App.data.ignored.includes(k)) App.data.ignored.push(k);
      App.removeIssue(is.id);
      App.save();
      App.emit('issues');
    },
    addDict(word) {
      const w = (word || '').trim().toLowerCase();
      if (!w) return;
      if (!App.data.dictionary.includes(w)) App.data.dictionary.push(w);
      App.data.issues = App.data.issues.filter((x) => !(x.text.toLowerCase() === w && (x.type === 'spell' || x.type === 'question')));
      App.save();
      App.emit('issues');
      App.toast(App.t('dict_added', { w }), 'ok');
    },
  };

  /* ---------- Всплывающие сообщения и окна ---------- */
  App.toast = (msg, type) => {
    let box = App.$('.toasts');
    if (!box) box = document.body.appendChild(App.el('<div class="toasts"></div>'));
    const t = App.el(`<div class="toast ${type || ''}"></div>`);
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 250);
    }, type === 'err' ? 5500 : 3200);
  };

  App.modal = ({ title, body, buttons, wide }) =>
    new Promise((res) => {
      const bg = App.el(`<div class="modal-bg"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><h2></h2><div class="mb"></div><div class="mf"></div></div></div>`);
      bg.querySelector('h2').textContent = title;
      const mb = bg.querySelector('.mb');
      if (typeof body === 'string') mb.innerHTML = body;
      else if (body) mb.appendChild(body);
      const close = (v) => {
        bg.remove();
        document.removeEventListener('keydown', onKey, true);
        res(v);
      };
      (buttons || [{ label: App.t('ok'), value: true, primary: true }]).forEach((b) => {
        const btn = App.el(`<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}"></button>`);
        btn.textContent = b.label;
        btn.onclick = () => close(typeof b.value === 'function' ? b.value(mb) : b.value);
        bg.querySelector('.mf').appendChild(btn);
      });
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close(null);
        }
      };
      document.addEventListener('keydown', onKey, true);
      bg.addEventListener('mousedown', (e) => {
        if (e.target === bg) close(null);
      });
      document.body.appendChild(bg);
      const f = bg.querySelector('.mb input:not([type=radio]):not([type=checkbox]), .btn.primary');
      if (f) f.focus();
    });

  App.confirm = (msg, okLabel, danger) =>
    App.modal({
      title: App.t('confirm_title'),
      body: `<p>${App.esc(msg)}</p>`,
      buttons: [
        { label: App.t('cancel'), value: false },
        { label: okLabel || App.t('ok'), value: true, primary: !danger, danger: !!danger },
      ],
    }).then((v) => !!v);

  // В просмотрщике Claude файлы сохраняются только через capability downloads
  App.download = async (name, text, type) => {
    const C = window.claude;
    const dl = C && typeof C.use === 'function' ? await C.use('downloads').catch(() => null) : null;
    if (dl) {
      try {
        await dl.save({ filename: name, data: text });
        return true;
      } catch (e) {
        if (e && e.code !== 'declined') App.toast(App.t('download_fail'), 'err');
        return false;
      }
    }
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    return true;
  };

  App.copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  };

  /* ---------- Упоминания имени в главах ---------- */
  App.mentions = (name) => {
    const words = (name || '').split(/[\s,]+/).filter((w) => w.length >= 3);
    if (!words.length) return [];
    const stems = words.map((w) => {
      w = w.toLowerCase().replace(/ё/g, 'е');
      return w.length > 4 ? w.slice(0, -1) : w;
    });
    const res = [];
    App.data.book.chapters.forEach((c) => {
      const t = (c.thesis + '\n' + c.text).toLowerCase().replace(/ё/g, 'е');
      let n = 0;
      stems.forEach((st) => {
        const re = new RegExp(`(?<![\\p{L}])${App.escRe(st)}\\p{L}{0,3}(?![\\p{L}])`, 'gu');
        n = Math.max(n, (t.match(re) || []).length);
      });
      if (n) res.push({ c, n, stem: stems[0] });
    });
    return res;
  };
})();
