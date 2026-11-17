'use strict';
/* =========================================================
   Редактор: главы, тезисы, текст с подсветкой, поиск, чтение вслух
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const icon = App.icon;

  /* ---------- Поле с подсветкой ----------
     Под прозрачным textarea лежит слой (.hl-back) с тем же текстом,
     в котором ошибки обёрнуты в <mark>. Текст в слое невидим,
     видны только подчёркивания — поэтому они совпадают с буквами. */
  class HL {
    constructor(field, ph) {
      this.field = field;
      this.ch = null;
      this.prev = '';
      this.target = null;
      this.el = App.el(`<div class="hl"><div class="hl-back" aria-hidden="true"></div><textarea class="hl-ta" rows="1" data-i18n-ph="${ph}"></textarea></div>`);
      this.back = this.el.firstElementChild;
      this.ta = this.el.lastElementChild;
      this.ta.spellcheck = !!App.data.settings.native;
      this.ta.addEventListener('input', () => this.onInput());
      this.ta.addEventListener('focus', () => (HL.last = this));
      this.ta.addEventListener('click', () => this.maybePopup());
      this.ta.addEventListener('keyup', (e) => {
        if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') this.maybePopup();
      });
      App.on('text-changed', (p) => {
        if (this.ch && p.chId === this.ch.id && p.field === this.field && this.ta.value !== this.ch[this.field]) this.sync();
      });
      App.on('issues', () => this.paint());
    }
    load(ch) {
      this.ch = ch;
      this.sync();
    }
    sync() {
      this.ta.value = this.ch[this.field];
      this.prev = this.ta.value;
      this.paint();
      this.fit();
    }
    isVisible() {
      return this.ta.offsetParent !== null;
    }
    onInput() {
      const v = this.ta.value;
      const d = App.diff(this.prev, v);
      this.ch[this.field] = v;
      this.prev = v;
      App.shiftIssues(this.ch.id, this.field, d.start, d.oldEnd, d.ins, d.del);
      App.Popup.hide();
      App.emit('typing', this);
      this.paint();
      this.fit();
      App.save();
    }
    fit() {
      if (!this.isVisible()) return;
      const sc = this.el.closest('.scroll, .tp-body');
      const top = sc ? sc.scrollTop : 0;
      this.el.style.minHeight = this.el.offsetHeight + 'px';
      this.ta.style.height = 'auto';
      this.ta.style.height = this.ta.scrollHeight + 'px';
      this.el.style.minHeight = '';
      if (sc) sc.scrollTop = top;
    }
    ranges() {
      const id = this.ch.id,
        f = this.field;
      const r = [];
      if (this.target) r.push({ o: this.target.o, l: this.target.l, cls: 'm-target', p: 0 });
      App.Find.ranges(id, f).forEach((x) => r.push(Object.assign(x, { p: 1 })));
      const rd = App.TTS.cur;
      if (rd && rd.ch === id && rd.field === f) r.push({ o: rd.offset, l: rd.length, cls: 'm-read', p: 2 });
      App.data.issues.forEach((is) => {
        if (is.ch === id && is.field === f) r.push({ o: is.offset, l: is.length, cls: 'm-' + is.type, id: is.id, p: 3 });
      });
      return r.sort((a, b) => a.o - b.o || a.p - b.p);
    }
    paint() {
      if (!this.ch) return;
      const text = this.ch[this.field];
      let html = '',
        pos = 0;
      for (const r of this.ranges()) {
        if (r.o < pos || r.o + r.l > text.length || r.l <= 0) continue;
        html += App.esc(text.slice(pos, r.o)) + `<mark class="${r.cls}"${r.id ? ` data-id="${r.id}"` : ''}>${App.esc(text.substr(r.o, r.l))}</mark>`;
        pos = r.o + r.l;
      }
      this.back.innerHTML = html + App.esc(text.slice(pos)) + ' ';
    }
    // Прокрутить так, чтобы фрагмент текста оказался по центру экрана
    scrollTo(o, l) {
      this.target = { o, l: Math.max(1, l) };
      this.paint();
      const m = this.back.querySelector('.m-target');
      if (m) m.scrollIntoView({ block: 'center' });
      this.target = null;
      this.paint();
    }
    maybePopup() {
      const s = this.ta.selectionStart,
        e = this.ta.selectionEnd;
      if (s !== e || !this.ch) return App.Popup.hide();
      const is = App.data.issues.find((x) => x.ch === this.ch.id && x.field === this.field && s >= x.offset && s <= x.offset + x.length);
      if (!is) return App.Popup.hide();
      const m = this.back.querySelector(`mark[data-id="${is.id}"]`);
      if (!m) return App.Popup.hide();
      const rect = m.getClientRects()[0] || m.getBoundingClientRect();
      App.Popup.show(is, rect, this);
    }
  }
  App.HL = HL;

  /* ---------- Подсказка по ошибке прямо в тексте ---------- */
  App.Popup = {
    el: null,
    show(is, rect, hl) {
      this.hide();
      const el = (this.el = App.el(`<div class="popup t-${is.type}"></div>`));
      let h = `<div class="p-type">${t('type_' + is.type)}</div><div class="p-msg">${App.esc(is.message)}</div>`;
      if (is.repl.length)
        h += `<div class="chips">${is.repl.map((r, i) => `<button class="chip repl" data-r="${i}">${r === '' ? '∅ ' + t('remove') : App.esc(r)}</button>`).join('')}</div>`;
      h += `<div class="p-actions"><button class="link-btn" data-a="skip">${t('skip')}</button>`;
      if ((is.type === 'spell' || is.type === 'question') && !/\s/.test(is.text)) h += `<button class="link-btn" data-a="dict">${t('to_dict')}</button>`;
      h += `<button class="link-btn" data-a="all">${t('all_edits')} ${icon('arrow')}</button></div>`;
      el.innerHTML = h;
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.r != null) App.Issues.apply(is, is.repl[+b.dataset.r], hl);
        else if (b.dataset.a === 'skip') App.Issues.skip(is);
        else if (b.dataset.a === 'dict') App.Issues.addDict(is.text);
        else if (b.dataset.a === 'all') App.go('pravki');
        this.hide();
      });
      document.body.appendChild(el);
      const w = el.offsetWidth,
        hh = el.offsetHeight;
      let x = Math.min(rect.left, innerWidth - w - 12);
      let y = rect.bottom + 6;
      if (y + hh > innerHeight - 34) y = rect.top - hh - 6;
      el.style.left = Math.max(12, x) + 'px';
      el.style.top = Math.max(8, y) + 'px';
    },
    hide() {
      if (this.el) {
        this.el.remove();
        this.el = null;
      }
    },
  };
  document.addEventListener('mousedown', (e) => {
    if (App.Popup.el && !App.Popup.el.contains(e.target) && !e.target.classList.contains('hl-ta')) App.Popup.hide();
  });

  /* ---------- Поиск и замена по книге ---------- */
  App.Find = {
    q: '',
    cs: false,
    scope: 'book',
    list: [],
    cur: -1,
    ranges(chId, field) {
      if (!this.q) return [];
      const out = [];
      this.list.forEach((m, i) => {
        if (m.ch === chId && m.field === field) out.push({ o: m.offset, l: m.length, cls: 'm-find' + (i === this.cur ? ' cur' : '') });
      });
      return out;
    },
    compute() {
      this.list = [];
      if (!this.q) return;
      const chs = this.scope === 'book' ? App.data.book.chapters : [App.active()];
      const q = this.cs ? this.q : this.q.toLowerCase();
      for (const c of chs)
        for (const f of ['thesis', 'text']) {
          const s = this.cs ? c[f] : c[f].toLowerCase();
          let i = 0;
          while ((i = s.indexOf(q, i)) !== -1) {
            this.list.push({ ch: c.id, field: f, offset: i, length: q.length });
            i += q.length;
          }
        }
      if (this.cur >= this.list.length) this.cur = this.list.length - 1;
    },
  };

  /* ---------- Чтение вслух ---------- */
  App.TTS = {
    cur: null,
    on: false,
    queue: [],
    hl: null,
    supported: 'speechSynthesis' in window,
    start(hl, s, e) {
      if (!this.supported) return App.toast(t('tts_unsupported'), 'err');
      this.stop();
      const part = hl.ch[hl.field].slice(s, e);
      const re = /[^.!?…\n]+[.!?…]*["»)]*/g;
      let m;
      const q = [];
      while ((m = re.exec(part))) {
        const str = m[0].trim();
        if (str) q.push({ o: s + m.index + (m[0].length - m[0].trimStart().length), l: str.length, str });
      }
      if (!q.length) return;
      this.queue = q;
      this.hl = hl;
      this.on = true;
      this.lang = /[а-яё]/i.test(part) ? 'ru' : 'en';
      const voices = speechSynthesis.getVoices();
      this.voice = voices.find((v) => v.lang.toLowerCase().startsWith(this.lang)) || null;
      App.emit('tts');
      this.next();
    },
    next() {
      if (!this.on) return;
      const item = this.queue.shift();
      if (!item) return this.stop();
      this.cur = { ch: this.hl.ch.id, field: this.hl.field, offset: item.o, length: item.l };
      this.hl.paint();
      const mk = this.hl.back.querySelector('.m-read');
      if (mk) mk.scrollIntoView({ block: 'nearest' });
      const u = new SpeechSynthesisUtterance(item.str);
      u.lang = this.lang === 'ru' ? 'ru-RU' : 'en-US';
      if (this.voice) u.voice = this.voice;
      u.onend = () => this.next();
      u.onerror = () => this.stop();
      speechSynthesis.speak(u);
    },
    stop() {
      const was = this.on;
      this.on = false;
      this.queue = [];
      this.cur = null;
      try {
        speechSynthesis.cancel();
      } catch (e) {}
      if (this.hl) this.hl.paint();
      if (was) App.emit('tts');
    },
  };
  if (App.TTS.supported) speechSynthesis.getVoices();

  /* ---------- Страница «Редактор» ---------- */
  App.Editor = {
    mounted: false,
    loadedId: null,
    busy: false,

    mount(root) {
      root.innerHTML = `
      <aside class="sidebar">
        <input class="book-title" data-i18n-ph="book_title_ph">
        <div class="side-sub"><span data-i18n="chapters"></span><button class="icon-btn sm add-ch" data-i18n-title="add_chapter">${icon('plus')}</button></div>
        <ul class="ch-list"></ul>
        <div class="side-foot">
          <div class="legend">
            <span><i style="background:var(--st-thesis)"></i><span data-i18n="st_thesis"></span></span>
            <span><i style="background:var(--st-draft)"></i><span data-i18n="st_draft"></span></span>
            <span><i style="background:var(--st-done)"></i><span data-i18n="st_done"></span></span>
          </div>
          <div class="total"></div>
        </div>
      </aside>
      <section class="main">
        <div class="toolbar">
          <button class="tb-btn primary" data-act="save" data-i18n-title="save_tip">${icon('save')}<span data-i18n="save"></span><span class="kbd">Ctrl+S</span></button>
          <span class="tb-sep"></span>
          <button class="tb-btn" data-act="style" data-i18n-title="style_tip">${icon('zap')}<span data-i18n="style_btn"></span></button>
          <button class="tb-btn" data-act="find" data-i18n-title="find_tip">${icon('search')}<span data-i18n="find_btn"></span></button>
          <button class="tb-btn" data-act="syn" data-i18n-title="syn_tip">${icon('repeat')}<span data-i18n="syn_btn"></span></button>
          <button class="tb-btn" data-act="tts" data-i18n-title="tts_tip">${icon('volume')}<span class="tts-label" data-i18n="tts_btn"></span></button>
          <button class="tb-btn" data-act="focus" data-i18n-title="focus_tip">${icon('focus')}<span data-i18n="focus_btn"></span></button>
          <span class="tb-hint" data-i18n="tb_hint"></span>
        </div>
        <div class="findbar hidden">
          <input class="inp f-find" data-i18n-ph="find_ph">
          <input class="inp f-repl" data-i18n-ph="replace_ph">
          <label class="chk"><input type="checkbox" class="f-case">Aa</label>
          <select class="inp f-scope" style="width:auto"><option value="book" data-i18n="scope_book"></option><option value="chapter" data-i18n="scope_chapter"></option></select>
          <span class="f-count"></span>
          <button class="icon-btn f-prev" data-i18n-title="prev">${icon('up')}</button>
          <button class="icon-btn f-next" data-i18n-title="next">${icon('down')}</button>
          <button class="btn sm f-one" data-i18n="replace_one"></button>
          <button class="btn sm f-all" data-i18n="replace_all"></button>
          <button class="icon-btn f-close" data-i18n-title="close">${icon('x')}</button>
        </div>
        <div class="find-results hidden"></div>
        <div class="split">
          <div class="scroll">
            <div class="page">
              <div class="ch-head">
                <input class="ch-title" data-i18n-ph="chapter_title_ph">
                <select class="st-select"></select>
                <div class="swatches ch-colors"></div>
              </div>
              <div class="text-slot"></div>
            </div>
          </div>
          <div class="splitter" data-i18n-title="tp_resize"></div>
          <aside class="thesis-panel">
            <div class="tp-inner">
              <div class="tp-head">
                <span class="tp-title">${icon('note')}<span data-i18n="thesis"></span></span>
                <span class="th-count"></span>
                <button class="icon-btn sm tp-close" data-i18n-title="tp_collapse">${icon('chev')}</button>
              </div>
              <div class="tp-body"></div>
            </div>
          </aside>
          <button class="tp-rail" data-i18n-title="tp_expand">${icon('chev', 'flip')}<span data-i18n="thesis"></span></button>
        </div>
      </section>`;

      const $ = (s) => App.$(s, root);
      this.root = root;
      this.list = $('.ch-list');
      this.total = $('.total');
      this.bookTitle = $('.book-title');
      this.title = $('.ch-title');
      this.status = $('.st-select');
      this.colors = $('.ch-colors');
      this.split = $('.split');
      this.page = $('.page');
      this.scroller = $('.scroll');
      this.findbar = $('.findbar');
      this.findRes = $('.find-results');

      this.thesisHL = new HL('thesis', 'thesis_ph');
      this.textHL = new HL('text', 'text_ph');
      $('.tp-body').appendChild(this.thesisHL.el);
      $('.text-slot').appendChild(this.textHL.el);

      // Название книги
      this.bookTitle.addEventListener('input', () => {
        App.data.book.title = this.bookTitle.value;
        App.save();
      });

      // Список глав
      $('.add-ch').addEventListener('click', () => this.addChapter());
      this.list.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]');
        if (del) return this.deleteChapter(del.dataset.del);
        const li = e.target.closest('.ch-item');
        if (li) this.select(li.dataset.id);
      });
      this.bindDrag();

      // Шапка главы
      this.title.addEventListener('input', () => {
        const c = App.active();
        c.title = this.title.value;
        App.save();
        this.renderList();
        App.Status.update();
      });
      this.status.addEventListener('change', () => {
        App.active().status = this.status.value;
        App.save();
        this.renderList();
      });
      this.colors.addEventListener('click', (e) => {
        const sw = e.target.closest('.sw');
        if (!sw) return;
        App.active().color = sw.dataset.color;
        App.save();
        this.renderHead();
        this.renderList();
      });
      // Боковая панель тезисов: свернуть / развернуть / потянуть за край
      $('.tp-close').addEventListener('click', () => this.setThesisOpen(false));
      $('.tp-rail').addEventListener('click', () => this.setThesisOpen(true));
      this.split.addEventListener('transitionend', (e) => {
        if (e.target.classList.contains('thesis-panel') && e.propertyName === 'width') this.fitAll();
      });
      this.bindSplitter();
      this.setTpWidth(App.data.settings.thesisWidth);
      this.applyThesisOpen(false);

      // Панель инструментов (mousedown не забирает фокус у текста — выделение сохраняется)
      const tb = $('.toolbar');
      tb.addEventListener('mousedown', (e) => {
        if (e.target.closest('.tb-btn')) e.preventDefault();
      });
      tb.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const a = b.dataset.act;
        if (a === 'save') this.saveAndCheck();
        else if (a === 'style') this.runStyle();
        else if (a === 'find') this.openFind();
        else if (a === 'syn') this.toSynonyms();
        else if (a === 'tts') this.toggleTTS();
        else if (a === 'focus') this.toggleFocus();
      });

      this.bindFind();
      this.scroller.addEventListener('scroll', () => App.Popup.hide());

      App.on('issues', () => {
        if (this.mounted) this.renderList();
      });
      App.on('typing', (hl) => {
        if (App.TTS.on) App.TTS.stop();
        if (this.findOpen()) this.refreshFind(false);
        if (hl === this.thesisHL) this.renderThesisCount();
      });
      App.on('tts', () => {
        const on = App.TTS.on;
        const b = $('[data-act="tts"]');
        b.classList.toggle('on', on);
        b.querySelector('svg').outerHTML = icon(on ? 'stop' : 'volume');
        const lbl = b.querySelector('.tts-label');
        lbl.dataset.i18n = on ? 'tts_stop' : 'tts_btn';
        lbl.textContent = t(lbl.dataset.i18n);
      });
      App.on('lang', () => {
        if (!this.mounted) return;
        this.renderHead();
        this.renderList();
        this.renderThesisCount();
        if (this.findOpen()) this.renderFindResults();
      });
      App.on('data-reset', () => {
        this.loadedId = null;
        this.setTpWidth(App.data.settings.thesisWidth);
        this.applyThesisOpen(false);
        if (this.findOpen()) this.closeFind();
        if (this.mounted && App.route === 'editor') this.show();
      });
      window.addEventListener('resize', App.debounce(() => {
        if (App.route === 'editor') {
          this.setTpWidth(App.data.settings.thesisWidth);
          this.fitAll();
        }
      }, 150));
      this.mounted = true;
    },

    show() {
      this.bookTitle.value = App.data.book.title;
      if (this.loadedId !== App.data.settings.active) this.loadChapter();
      else {
        [this.thesisHL, this.textHL].forEach((hl) => {
          if (hl.ta.value !== hl.ch[hl.field]) hl.sync();
          else {
            hl.paint();
            hl.fit();
          }
        });
        this.renderList();
      }
    },

    loadChapter() {
      const c = App.active();
      this.loadedId = c.id;
      App.Popup.hide();
      if (App.TTS.on) App.TTS.stop();
      this.renderHead();
      this.thesisHL.load(c);
      this.textHL.load(c);
      this.renderThesisCount();
      this.renderList();
      this.scroller.scrollTop = 0;
      App.Status.update();
    },

    renderHead() {
      const c = App.active();
      this.title.value = c.title;
      this.split.style.setProperty('--chc', c.color);
      document.body.style.setProperty('--chc', c.color);
      this.status.innerHTML = App.STATUSES.map((s) => `<option value="${s}" ${s === c.status ? 'selected' : ''}>${t('st_' + s)}</option>`).join('');
      this.status.style.color = `var(--st-${c.status})`;
      this.colors.innerHTML = App.COLORS.map((col) => `<span class="sw ${col === c.color ? 'on' : ''}" data-color="${col}" style="background:${col}"></span>`).join('');
    },

    renderThesisCount() {
      const c = App.active();
      const n = App.words(c.thesis);
      App.$('.th-count', this.root).textContent = n ? t('words_n', { n: App.fmt(n) }) : '';
    },

    renderList() {
      const d = App.data,
        act = d.settings.active;
      const cnt = {};
      d.issues.forEach((is) => (cnt[is.ch] = (cnt[is.ch] || 0) + 1));
      this.list.innerHTML = d.book.chapters
        .map(
          (c) => `<li class="ch-item ${c.id === act ? 'active' : ''}" draggable="true" data-id="${c.id}">
            <span class="ch-bar" style="background:${c.color}"></span>
            <span class="ch-name">${App.esc(App.chapterLabel(c))}</span>
            ${cnt[c.id] ? `<span class="ch-cnt" title="${t('tab_pravki')}">${cnt[c.id]}</span>` : ''}
            <span class="ch-st" style="background:var(--st-${c.status})" title="${t('st_' + c.status)}"></span>
            <button class="ch-del" data-del="${c.id}" title="${t('delete')}">${icon('x')}</button>
          </li>`
        )
        .join('');
      let tw = 0,
        th = 0;
      d.book.chapters.forEach((c) => {
        tw += App.words(c.text);
        th += App.words(c.thesis);
      });
      this.total.textContent = t('total_words', { n: App.fmt(tw), m: App.fmt(th) });
    },

    bindDrag() {
      const L = this.list;
      const clear = () => App.$$('.drop-before,.drop-after,.dragging', L).forEach((x) => x.classList.remove('drop-before', 'drop-after', 'dragging'));
      L.addEventListener('dragstart', (e) => {
        const li = e.target.closest('.ch-item');
        if (!li) return;
        this.dragId = li.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dragId);
        li.classList.add('dragging');
      });
      L.addEventListener('dragover', (e) => {
        const li = e.target.closest('.ch-item');
        if (!li || !this.dragId) return;
        e.preventDefault();
        App.$$('.drop-before,.drop-after', L).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
        const r = li.getBoundingClientRect();
        li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
      });
      L.addEventListener('drop', (e) => {
        e.preventDefault();
        const li = e.target.closest('.ch-item');
        if (!li || !this.dragId || li.dataset.id === this.dragId) return clear();
        const before = li.classList.contains('drop-before');
        const arr = App.data.book.chapters;
        const [item] = arr.splice(App.chapterIndex(this.dragId), 1);
        let to = App.chapterIndex(li.dataset.id);
        if (!before) to++;
        arr.splice(to, 0, item);
        App.save();
        this.renderList();
      });
      L.addEventListener('dragend', () => {
        this.dragId = null;
        clear();
      });
    },

    select(id) {
      if (App.data.settings.active === id && this.loadedId === id) return;
      App.data.settings.active = id;
      App.save();
      this.loadChapter();
      if (this.findOpen()) this.refreshFind(false);
    },

    addChapter() {
      const chs = App.data.book.chapters;
      const c = App.newChapter(String(chs.length + 1), chs.length);
      chs.push(c);
      App.save();
      this.select(c.id);
      this.title.focus();
      this.title.select();
    },

    async deleteChapter(id) {
      const chs = App.data.book.chapters;
      if (chs.length <= 1) return App.toast(t('last_chapter'), 'err');
      const c = App.chapter(id);
      if (!(await App.confirm(t('del_chapter_q', { name: App.chapterLabel(c) }), t('delete'), true))) return;
      const i = App.chapterIndex(id);
      chs.splice(i, 1);
      App.data.issues = App.data.issues.filter((x) => x.ch !== id);
      if (App.data.settings.active === id) App.data.settings.active = chs[Math.max(0, i - 1)].id;
      App.save();
      App.emit('issues');
      this.loadChapter();
    },

    /* --- Панель тезисов справа ---
       Открыта или нет — общий выбор для всех глав (settings.thesisOpen).
       Сворачивание: ширина панели плавно уходит в 0, а содержимое
       одновременно уезжает вправо (transform) — анимация в CSS. */
    setThesisOpen(open) {
      App.data.settings.thesisOpen = open;
      App.save();
      this.applyThesisOpen(true);
      if (open) setTimeout(() => this.thesisHL.ta.focus({ preventScroll: true }), 320);
    },
    applyThesisOpen(animate) {
      const open = App.data.settings.thesisOpen !== false;
      if (!animate) this.split.classList.add('no-anim');
      this.split.classList.toggle('tp-closed', !open);
      if (!animate) {
        void this.split.offsetWidth; // применить без анимации
        this.split.classList.remove('no-anim');
        requestAnimationFrame(() => this.fitAll());
      }
    },
    setTpWidth(w) {
      const max = Math.max(260, Math.min(720, window.innerWidth * 0.5));
      w = Math.round(Math.min(max, Math.max(240, +w || 360)));
      App.data.settings.thesisWidth = w;
      this.split.style.setProperty('--tpw', w + 'px');
      this.thesisHL.fit();
    },
    bindSplitter() {
      const sp = App.$('.splitter', this.root);
      sp.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.clientX,
          startW = App.data.settings.thesisWidth;
        this.split.classList.add('no-anim');
        sp.classList.add('drag');
        document.body.classList.add('resizing');
        const move = (ev) => this.setTpWidth(startW + (startX - ev.clientX));
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          this.split.classList.remove('no-anim');
          sp.classList.remove('drag');
          document.body.classList.remove('resizing');
          App.save();
          this.fitAll();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
      sp.addEventListener('dblclick', () => {
        this.setTpWidth(360);
        App.save();
        this.fitAll();
      });
    },
    fitAll() {
      this.thesisHL.fit();
      this.textHL.fit();
    },

    // Активное поле: то, где последний раз был курсор (тезисы или текст)
    activeHL() {
      const l = HL.last;
      if (l && (l === this.thesisHL || l === this.textHL) && l.isVisible()) return l;
      return this.textHL;
    },

    /* --- Сохранить и проверить выделенное --- */
    async saveAndCheck() {
      App.saveNow();
      const hl = this.activeHL();
      const ta = hl.ta;
      let s = ta.selectionStart,
        e = ta.selectionEnd;
      if (s === e || document.activeElement !== ta) {
        App.toast(t('saved_no_sel'), 'ok');
        return;
      }
      if (this.busy) return;
      const ch = hl.ch,
        field = hl.field,
        text = ch[field];
      [s, e] = App.Checker.expand(text, s, e);
      const snippet = text.slice(s, e);
      if (!snippet.trim()) return;
      ta.setSelectionRange(s, e);
      this.busy = true;
      App.emit('check-start');
      try {
        const list = await App.Checker.check(snippet, s, ch.id, field);
        if (ch[field].slice(s, e) !== snippet) {
          App.toast(t('changed_during'), 'err');
          return;
        }
        const n = App.replaceIssues(ch.id, field, s, e, 'lt', list);
        App.toast(n ? t('found_n', { n }) : t('found_none'), n ? '' : 'ok');
      } catch (err) {
        console.error(err);
        App.toast(err.userMsg || t('lt_error'), 'err');
      } finally {
        this.busy = false;
        App.emit('check-end');
      }
    },

    selRange(hl) {
      const ta = hl.ta;
      let s = ta.selectionStart,
        e = ta.selectionEnd;
      if (s === e) {
        s = 0;
        e = hl.ch[hl.field].length;
      }
      return [s, e];
    },

    runStyle() {
      const hl = this.activeHL();
      const [s, e] = this.selRange(hl);
      const list = App.Style.analyze(hl.ch[hl.field], s, e, hl.ch.id, hl.field);
      const n = App.replaceIssues(hl.ch.id, hl.field, s, e, 'style', list);
      App.toast(n ? t('style_n', { n }) : t('style_none'), n ? '' : 'ok');
    },

    toSynonyms() {
      const hl = this.activeHL();
      const text = hl.ch[hl.field];
      let s = hl.ta.selectionStart,
        e = hl.ta.selectionEnd;
      const W = /[\p{L}\-’']/u;
      if (s === e) {
        while (s > 0 && W.test(text[s - 1])) s--;
        while (e < text.length && W.test(text[e])) e++;
      }
      const word = text.slice(s, e).trim();
      if (!word || /\s/.test(word) || word.length > 40) {
        App.go('syn');
        return;
      }
      App.Syn.origin = { ch: hl.ch.id, field: hl.field, start: s, end: e, word };
      App.go('syn');
      App.Syn.lookup(word);
    },

    toggleTTS() {
      if (App.TTS.on) return App.TTS.stop();
      const hl = this.activeHL();
      const ta = hl.ta;
      let s = ta.selectionStart,
        e = ta.selectionEnd;
      const len = hl.ch[hl.field].length;
      if (s === e) {
        e = len;
        if (s >= len) s = 0;
      }
      App.TTS.start(hl, s, e);
    },

    toggleFocus(force) {
      const on = force != null ? force : !document.body.classList.contains('focus');
      document.body.classList.toggle('focus', on);
      requestAnimationFrame(() => {
        this.thesisHL.fit();
        this.textHL.fit();
        if (on) this.textHL.ta.focus();
      });
    },

    /* --- Переход к месту в тексте (из «Правок», поиска, персонажей) --- */
    reveal(r) {
      App.go('editor');
      if (App.data.settings.active !== r.ch) this.select(r.ch);
      const hl = r.field === 'thesis' ? this.thesisHL : this.textHL;
      if (r.field === 'thesis' && App.data.settings.thesisOpen === false) {
        App.data.settings.thesisOpen = true;
        this.applyThesisOpen(false);
      }
      requestAnimationFrame(() => {
        hl.fit();
        hl.ta.focus({ preventScroll: true });
        hl.ta.setSelectionRange(r.offset, r.offset + r.length);
        hl.scrollTo(r.offset, r.length);
      });
    },

    /* --- Поиск и замена --- */
    findOpen() {
      return this.mounted && !this.findbar.classList.contains('hidden');
    },
    openFind(q) {
      this.findbar.classList.remove('hidden');
      const inp = App.$('.f-find', this.findbar);
      if (q == null) {
        const hl = this.activeHL();
        const sel = hl.ta.value.slice(hl.ta.selectionStart, hl.ta.selectionEnd);
        if (sel && sel.length < 60 && !sel.includes('\n')) q = sel;
      }
      if (q != null) inp.value = q;
      inp.focus();
      inp.select();
      this.refreshFind(true);
    },
    closeFind() {
      this.findbar.classList.add('hidden');
      this.findRes.classList.add('hidden');
      App.Find.q = '';
      App.Find.list = [];
      this.thesisHL.paint();
      this.textHL.paint();
    },
    refreshFind(jump) {
      const F = App.Find;
      F.q = App.$('.f-find', this.findbar).value;
      F.cs = App.$('.f-case', this.findbar).checked;
      F.scope = App.$('.f-scope', this.findbar).value;
      F.compute();
      if (jump) {
        const act = App.data.settings.active;
        const i = F.list.findIndex((m) => m.ch === act);
        F.cur = F.list.length ? (i >= 0 ? i : 0) : -1;
      }
      this.renderFindResults();
      this.thesisHL.paint();
      this.textHL.paint();
      if (jump && F.cur >= 0) this.showMatch(F.cur);
    },
    renderFindResults() {
      const F = App.Find;
      App.$('.f-count', this.findbar).textContent = F.q ? (F.list.length ? `${F.cur + 1} / ${F.list.length}` : t('no_matches')) : '';
      if (!F.q || F.scope !== 'book' || !F.list.length) {
        this.findRes.classList.add('hidden');
        return;
      }
      this.findRes.classList.remove('hidden');
      this.findRes.innerHTML = F.list
        .slice(0, 300)
        .map((m, i) => {
          const c = App.chapter(m.ch);
          const txt = c[m.field];
          const a = Math.max(0, m.offset - 40),
            b = Math.min(txt.length, m.offset + m.length + 60);
          const ctx = App.esc(txt.slice(a, m.offset)) + '<b>' + App.esc(txt.substr(m.offset, m.length)) + '</b>' + App.esc(txt.slice(m.offset + m.length, b));
          return `<div class="fr ${i === F.cur ? 'cur' : ''}" data-i="${i}"><span class="fr-ch">${App.esc(App.chapterLabel(c))}${m.field === 'thesis' ? ' · ' + t('thesis_short') : ''}</span><span class="fr-ctx">${ctx.replace(/\n/g, ' ')}</span></div>`;
        })
        .join('');
    },
    showMatch(i) {
      const F = App.Find;
      if (i < 0 || i >= F.list.length) return;
      F.cur = i;
      const m = F.list[i];
      if (App.data.settings.active !== m.ch) {
        App.data.settings.active = m.ch;
        App.save();
        this.loadChapter();
      }
      if (m.field === 'thesis' && App.data.settings.thesisOpen === false) {
        App.data.settings.thesisOpen = true;
        this.applyThesisOpen(false);
      }
      const hl = m.field === 'thesis' ? this.thesisHL : this.textHL;
      requestAnimationFrame(() => {
        this.thesisHL.paint();
        this.textHL.paint();
        const mk = hl.back.querySelector('.m-find.cur');
        if (mk) mk.scrollIntoView({ block: 'center' });
      });
      this.renderFindResults();
      const cur = App.$('.fr.cur', this.findRes);
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    },
    bindFind() {
      const fb = this.findbar;
      const inp = App.$('.f-find', fb);
      const go = (d) => {
        const n = App.Find.list.length;
        if (n) this.showMatch((App.Find.cur + d + n) % n);
      };
      inp.addEventListener('input', App.debounce(() => this.refreshFind(true), 150));
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go(e.shiftKey ? -1 : 1);
        }
      });
      App.$('.f-case', fb).addEventListener('change', () => this.refreshFind(true));
      App.$('.f-scope', fb).addEventListener('change', () => this.refreshFind(true));
      App.$('.f-next', fb).addEventListener('click', () => go(1));
      App.$('.f-prev', fb).addEventListener('click', () => go(-1));
      App.$('.f-close', fb).addEventListener('click', () => this.closeFind());
      fb.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.closeFind();
        }
      });
      App.$('.f-one', fb).addEventListener('click', () => {
        const F = App.Find,
          m = F.list[F.cur];
        if (!m) return;
        const rep = App.$('.f-repl', fb).value;
        App.applyEdit(m.ch, m.field, m.offset, m.offset + m.length, rep);
        const keep = F.cur;
        F.compute();
        F.cur = F.list.length ? Math.min(keep, F.list.length - 1) : -1;
        this.renderFindResults();
        if (F.cur >= 0) this.showMatch(F.cur);
        else {
          this.thesisHL.paint();
          this.textHL.paint();
        }
      });
      App.$('.f-all', fb).addEventListener('click', async () => {
        const F = App.Find;
        if (!F.list.length) return;
        const rep = App.$('.f-repl', fb).value;
        const n = F.list.length;
        if (!(await App.confirm(t('replace_all_q', { n, a: F.q, b: rep }), t('replace_all')))) return;
        [...F.list]
          .sort((a, b) => (a.ch + a.field).localeCompare(b.ch + b.field) || b.offset - a.offset)
          .forEach((m) => App.applyEdit(m.ch, m.field, m.offset, m.offset + m.length, rep));
        App.toast(t('replaced_n', { n }), 'ok');
        this.refreshFind(true);
      });
      this.findRes.addEventListener('click', (e) => {
        const r = e.target.closest('.fr');
        if (r) this.showMatch(+r.dataset.i);
      });
    },
  };
})();
