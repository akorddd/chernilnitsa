'use strict';
/* =========================================================
   Страницы: Правки, Синонимы, Персонажи, Мир, Заметки
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const esc = App.esc;
  const icon = App.icon;

  /* =================== ПРАВКИ =================== */
  App.Pravki = {
    filter: 'all',
    mount(root) {
      root.innerHTML = `<div class="page-wrap"><div class="page-inner">
        <h1 class="pg" data-i18n="pravki_title"></h1>
        <p class="pg-sub" data-i18n="pravki_sub"></p>
        <div class="filters"></div>
        <div class="pv-tools">
          <label><span data-i18n="check_lang"></span>
            <select class="inp pv-lang"><option value="ru-RU">Русский</option><option value="en-US">English (US)</option><option value="auto" data-i18n="auto"></option></select>
          </label>
          <span class="sp"></span>
          <button class="btn sm pv-clear">${icon('trash')}<span data-i18n="clear_all"></span></button>
        </div>
        <div class="pv-list"></div>
        <details class="dict"><summary></summary><div class="chips dict-chips"></div></details>
      </div></div>`;
      this.root = root;
      const $ = (s) => App.$(s, root);
      $('.filters').addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        this.filter = b.dataset.f;
        this.render();
      });
      const lang = $('.pv-lang');
      lang.addEventListener('change', () => {
        App.data.settings.checkLang = lang.value;
        App.save();
      });
      $('.pv-clear').addEventListener('click', async () => {
        if (!App.data.issues.length) return;
        if (!(await App.confirm(t('clear_all_q'), t('clear_all'), true))) return;
        App.data.issues = [];
        App.save();
        App.emit('issues');
      });
      $('.dict-chips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-w]');
        if (!b) return;
        App.data.dictionary = App.data.dictionary.filter((w) => w !== b.dataset.w);
        App.save();
        this.render();
      });
      $('.pv-list').addEventListener('click', (e) => this.onClick(e));
      $('.pv-list').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('ask-inp')) {
          const card = e.target.closest('.issue');
          App.$('[data-a="ask"]', card).click();
        }
      });
      App.on('issues', () => App.route === 'pravki' && this.render());
      App.on('lang', () => this.mounted && this.render());
      App.on('data-reset', () => App.route === 'pravki' && this.render());
    },

    show() {
      this.render();
    },

    render() {
      const d = App.data;
      const $ = (s) => App.$(s, this.root);
      $('.pv-lang').value = d.settings.checkLang;

      // Убираем правки, текст которых уже не совпадает
      d.issues = d.issues.filter((is) => {
        const c = App.chapter(is.ch);
        return c && c[is.field].substr(is.offset, is.length) === is.text;
      });

      const counts = { all: d.issues.length };
      App.TYPES.forEach((k) => (counts[k] = d.issues.filter((x) => x.type === k).length));
      $('.filters').innerHTML = ['all', ...App.TYPES]
        .map(
          (k) => `<button class="fchip ${k === this.filter ? 'on' : ''} ${k !== 'all' ? 't-' + k : ''}" data-f="${k}">
            ${k !== 'all' ? '<span class="d"></span>' : ''}${t(k === 'all' ? 'all' : 'type_' + k)} <span class="n">${counts[k]}</span></button>`
        )
        .join('');

      const list = d.issues.filter((x) => this.filter === 'all' || x.type === this.filter);
      const box = $('.pv-list');
      if (!d.issues.length) {
        box.innerHTML = `<div class="empty"><div class="big">✓</div>${t('pravki_empty')}</div>`;
      } else if (!list.length) {
        box.innerHTML = `<div class="empty">${t('pravki_empty_filter')}</div>`;
      } else {
        let html = '';
        d.book.chapters.forEach((c) => {
          const items = list
            .filter((x) => x.ch === c.id)
            .sort((a, b) => (a.field === b.field ? a.offset - b.offset : a.field === 'thesis' ? -1 : 1));
          if (!items.length) return;
          html += `<div class="grp" style="--c:${c.color}"><span class="bar"></span>${esc(App.chapterLabel(c))}<span class="n">${items.length}</span></div>`;
          html += items.map((is) => this.card(is, c)).join('');
        });
        box.innerHTML = html;
      }

      const dict = d.dictionary;
      $('.dict summary').textContent = t('my_dict', { n: dict.length });
      $('.dict-chips').innerHTML = dict.length
        ? dict.map((w) => `<button class="chip" data-w="${esc(w)}" title="${t('dict_remove')}">${esc(w)}<span class="x">×</span></button>`).join('')
        : `<span style="color:var(--text-faint)">${t('dict_empty')}</span>`;
    },

    card(is, c) {
      const txt = c[is.field];
      const a = Math.max(0, is.offset - 60),
        b = Math.min(txt.length, is.offset + is.length + 60);
      const word = is.type === 'question' && is.source === 'lt' ? `[${is.text}]` : is.text;
      const ctx = (a > 0 ? '…' : '') + esc(txt.slice(a, is.offset)) + `<mark>${esc(word)}</mark>` + esc(txt.slice(is.offset + is.length, b)) + (b < txt.length ? '…' : '');
      let msg = esc(is.message);
      if (is.type === 'question' && is.source === 'lt') msg = `${t('q_lt', { w: esc(is.text) })}<small>${esc(is.message)}</small>`;
      const single = !/\s/.test(is.text);
      return `<div class="issue t-${is.type}" data-id="${is.id}">
        <div class="i-top"><span>${t('type_' + is.type)}</span><span class="i-field">${t(is.field === 'thesis' ? 'thesis' : 'text')}</span></div>
        <div class="i-msg">${msg}</div>
        <div class="i-ctx">${ctx.replace(/\n/g, ' ¶ ')}</div>
        ${is.repl.length ? `<div class="chips">${is.repl.map((r, i) => `<button class="chip repl" data-a="repl" data-r="${i}">${r === '' ? '∅ ' + t('remove') : esc(r)}</button>`).join('')}</div>` : ''}
        ${is.type === 'question' ? `<div class="i-ask"><input class="inp ask-inp" placeholder="${t('ask_ph')}"><button class="btn sm primary" data-a="ask">${t('replace_one')}</button></div>` : ''}
        <div class="i-actions">
          <button class="link-btn" data-a="go">${icon('arrow')}${t('go_to')}</button>
          <button class="link-btn" data-a="skip">${t(is.type === 'question' ? 'all_right' : 'skip')}</button>
          ${(is.type === 'spell' || (is.type === 'question' && is.source === 'lt')) && single ? `<button class="link-btn" data-a="dict">${t('to_dict')}</button>` : ''}
        </div>
      </div>`;
    },

    onClick(e) {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const card = b.closest('.issue');
      const is = App.data.issues.find((x) => x.id === card.dataset.id);
      if (!is) return;
      const a = b.dataset.a;
      if (a === 'repl') App.Issues.apply(is, is.repl[+b.dataset.r], null);
      else if (a === 'ask') {
        const v = App.$('.ask-inp', card).value;
        if (!v.trim()) return App.$('.ask-inp', card).focus();
        App.Issues.apply(is, v, null);
      } else if (a === 'skip') App.Issues.skip(is);
      else if (a === 'dict') App.Issues.addDict(is.text);
      else if (a === 'go') App.Editor.reveal(is);
    },
  };

  /* =================== СИНОНИМЫ =================== */
  App.Syn = {
    mode: 'syn',
    origin: null,
    cache: {},
    word: '',
    mount(root) {
      root.innerHTML = `<div class="page-wrap"><div class="page-inner narrow">
        <h1 class="pg" data-i18n="syn_title"></h1>
        <p class="pg-sub" data-i18n="syn_sub"></p>
        <div class="syn-form">
          <input class="inp syn-word" data-i18n-ph="syn_ph" autocomplete="off">
          <div class="seg"><button data-m="syn" data-i18n="synonyms"></button><button data-m="ant" data-i18n="antonyms"></button></div>
          <button class="btn primary syn-go">${icon('search')}<span data-i18n="find_go"></span></button>
        </div>
        <div class="origin hidden"></div>
        <div class="syn-results"></div>
        <div class="syn-source" data-i18n="syn_source"></div>
      </div></div>`;
      this.root = root;
      const $ = (s) => App.$(s, root);
      this.inp = $('.syn-word');
      this.inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.lookup(this.inp.value);
      });
      $('.syn-go').addEventListener('click', () => this.lookup(this.inp.value));
      $('.seg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        this.mode = b.dataset.m;
        this.renderSeg();
        if (this.inp.value.trim()) this.lookup(this.inp.value);
      });
      $('.origin').addEventListener('click', (e) => {
        if (e.target.closest('[data-a="cancel"]')) {
          this.origin = null;
          this.renderOrigin();
        }
      });
      $('.syn-results').addEventListener('click', (e) => {
        const b = e.target.closest('[data-w]');
        if (b) this.pick(b.dataset.w);
      });
      App.on('lang', () => {
        if (!this.mounted) return;
        this.renderOrigin();
        if (this.last) this.renderResults(this.last);
      });
    },
    show() {
      this.renderSeg();
      this.renderOrigin();
      if (!this.word) setTimeout(() => this.inp.focus(), 0);
    },
    renderSeg() {
      App.$$('.seg button', this.root).forEach((b) => b.classList.toggle('on', b.dataset.m === this.mode));
    },
    renderOrigin() {
      const box = App.$('.origin', this.root);
      const o = this.origin;
      if (!o) return box.classList.add('hidden');
      const c = App.chapter(o.ch);
      if (!c) {
        this.origin = null;
        return box.classList.add('hidden');
      }
      box.classList.remove('hidden');
      box.innerHTML = `${icon('edit')}<span>${t('syn_origin', { w: esc(o.word), ch: esc(App.chapterLabel(c)) })}</span><button class="btn sm" data-a="cancel">${t('syn_origin_cancel')}</button>`;
    },

    async lookup(word) {
      word = (word || '').trim();
      if (!word) return;
      this.word = word;
      this.inp.value = word;
      const lang = /[а-яё]/i.test(word) ? 'ru' : 'en';
      const key = `${this.mode}|${lang}|${word.toLowerCase()}`;
      const box = App.$('.syn-results', this.root);
      box.innerHTML = `<div class="syn-status"><span class="spin"></span>${t('searching')}</div>`;
      try {
        if (!this.cache[key]) this.cache[key] = lang === 'ru' ? await this.ru(word, this.mode) : await this.en(word, this.mode);
        if (this.word !== word) return;
        this.last = { groups: this.cache[key], word, lang };
        this.renderResults(this.last);
      } catch (e) {
        console.error(e);
        box.innerHTML = `<div class="syn-status" style="color:var(--spell)">${t('syn_network')}</div>`;
      }
    },

    // Викисловарь: разделы «Синонимы» / «Антонимы» в русской статье
    async ru(word, mode) {
      const tryWord = async (w) => {
        const url = `https://ru.wiktionary.org/w/api.php?action=parse&format=json&origin=*&prop=wikitext&redirects=1&page=${encodeURIComponent(w)}`;
        const j = await (await fetch(url)).json();
        if (j.error || !j.parse) return null;
        return j.parse.wikitext['*'];
      };
      let wt = await tryWord(word.toLowerCase());
      if (wt == null && word !== word.toLowerCase()) wt = await tryWord(word);
      if (wt == null) return [];
      const i = wt.indexOf('{{-ru-}}');
      if (i < 0) return [];
      let rest = wt.slice(i + 8);
      const nx = rest.search(/\n=\s*\{\{-[\w-]+-\}\}\s*=/);
      if (nx >= 0) rest = rest.slice(0, nx);
      rest += '\n=';
      const head = mode === 'syn' ? 'Синонимы' : 'Антонимы';
      const secRe = new RegExp(`\\n=+\\s*${head}\\s*=+\\s*\\n([\\s\\S]*?)(?=\\n=)`, 'g');
      const groups = [];
      const seen = new Set([word.toLowerCase()]);
      let m;
      while ((m = secRe.exec(rest))) {
        m[1].split('\n').forEach((line) => {
          if (!/^#/.test(line)) return;
          const ws = [];
          line.replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (_, w) => {
            w = w.trim();
            if (w && !w.includes(':') && !seen.has(w.toLowerCase())) {
              seen.add(w.toLowerCase());
              ws.push(w);
            }
          });
          if (ws.length) groups.push({ label: t('sense_n', { n: groups.length + 1 }), words: ws });
        });
      }
      return groups;
    },

    // Datamuse: английские синонимы, антонимы и близкие по смыслу слова
    async en(word, mode) {
      const get = async (q) => (await (await fetch(`https://api.datamuse.com/words?${q}=${encodeURIComponent(word)}&max=40`)).json()).map((x) => x.word);
      if (mode === 'ant') {
        const a = await get('rel_ant');
        return a.length ? [{ label: t('antonyms'), words: a }] : [];
      }
      const [syn, ml] = await Promise.all([get('rel_syn'), get('ml')]);
      const groups = [];
      if (syn.length) groups.push({ label: t('synonyms'), words: syn });
      const rest = ml.filter((w) => !syn.includes(w)).slice(0, 25);
      if (rest.length) groups.push({ label: t('similar'), words: rest });
      return groups;
    },

    renderResults({ groups, word }) {
      const box = App.$('.syn-results', this.root);
      if (!groups.length) {
        box.innerHTML = `<div class="empty">${t(this.mode === 'syn' ? 'syn_none' : 'ant_none', { w: esc(word) })}</div>`;
        return;
      }
      box.innerHTML =
        `<p class="pg-sub" style="margin:0 0 4px">${t(this.origin ? 'syn_click_replace' : 'syn_click_copy')}</p>` +
        groups
          .map(
            (g) => `<div class="syn-group"><div class="lbl">${esc(g.label)}</div><div class="chips">${g.words
              .map((w) => `<button class="chip syn-chip" data-w="${esc(w)}">${esc(w)}</button>`)
              .join('')}</div></div>`
          )
          .join('');
    },

    async pick(w) {
      const o = this.origin;
      if (o) {
        const c = App.chapter(o.ch);
        if (!c || c[o.field].slice(o.start, o.end) !== o.word) {
          this.origin = null;
          this.renderOrigin();
          App.toast(t('stale'), 'err');
          return;
        }
        let rep = w;
        if (o.word[0] && o.word[0] === o.word[0].toUpperCase() && o.word[0] !== o.word[0].toLowerCase()) rep = w[0].toUpperCase() + w.slice(1);
        App.applyEdit(o.ch, o.field, o.start, o.end, rep);
        App.toast(t('replaced_word', { a: o.word, b: rep }), 'ok');
        this.origin = null;
        App.Editor.reveal({ ch: o.ch, field: o.field, offset: o.start, length: rep.length });
      } else {
        await App.copy(w);
        App.toast(t('copied', { w }), 'ok');
      }
    },
  };

  /* =================== СПИСОК С КАРТОЧКАМИ (общий) =================== */
  App.ListEditor = function (cfg) {
    const self = { sel: null, q: '', cfg };
    const items = () => App.data[cfg.key];
    const find = (id) => items().find((x) => x.id === id);

    self.mount = (root) => {
      root.innerHTML = `<div class="le">
        <div class="le-list">
          <div class="le-title">${t(cfg.titleKey)}</div>
          <div class="le-head"><input class="inp le-q" placeholder="${t('search_ph')}"><button class="btn primary sm le-add">${icon('plus')}<span>${t('add')}</span></button></div>
          <div class="le-items"></div>
        </div>
        <div class="le-form"></div>
      </div>`;
      self.root = root;
      self.itemsEl = App.$('.le-items', root);
      self.formEl = App.$('.le-form', root);
      App.$('.le-q', root).addEventListener('input', (e) => {
        self.q = e.target.value;
        self.renderList();
      });
      App.$('.le-add', root).addEventListener('click', () => self.add());
      self.itemsEl.addEventListener('click', (e) => {
        const it = e.target.closest('.le-item');
        if (!it) return;
        self.sel = it.dataset.id;
        self.render();
      });
      self.formEl.addEventListener('input', (e) => {
        const k = e.target.dataset.k;
        const it = find(self.sel);
        if (!k || !it) return;
        it[k] = e.target.value;
        it.updated = Date.now();
        App.save();
        self.renderList();
        if (k === cfg.title && cfg.mentions) self.renderMentions(it);
      });
      self.formEl.addEventListener('click', async (e) => {
        const it = find(self.sel);
        if (!it) return;
        const sw = e.target.closest('.sw');
        if (sw) {
          it.color = sw.dataset.color;
          App.save();
          self.render();
          return;
        }
        const mt = e.target.closest('[data-mch]');
        if (mt) {
          App.go('editor');
          App.Editor.select(mt.dataset.mch);
          App.Editor.openFind(mt.dataset.stem);
          return;
        }
        if (e.target.closest('.le-del')) {
          if (!(await App.confirm(t('del_item_q', { name: it[cfg.title] || t(cfg.untitled) }), t('delete'), true))) return;
          App.data[cfg.key] = items().filter((x) => x.id !== it.id);
          self.sel = null;
          App.save();
          self.render();
        }
      });
    };

    self.show = () => {
      if (self.sel && !find(self.sel)) self.sel = null;
      if (!self.sel && items().length) self.sel = items()[0].id;
      self.render();
    };

    self.add = () => {
      const it = { id: App.uid(), color: App.COLORS[items().length % App.COLORS.length], updated: Date.now() };
      it[cfg.title] = '';
      cfg.fields.forEach((f) => (it[f.k] = ''));
      if (cfg.prepend) items().unshift(it);
      else items().push(it);
      self.sel = it.id;
      self.q = '';
      App.$('.le-q', self.root).value = '';
      App.save();
      self.render();
      const n = App.$('.big-name', self.formEl);
      if (n) n.focus();
    };

    self.render = () => {
      self.renderList();
      self.renderForm();
    };

    self.renderList = () => {
      const q = self.q.trim().toLowerCase();
      const list = items().filter((it) => !q || cfg.fields.concat({ k: cfg.title }).some((f) => (it[f.k] || '').toLowerCase().includes(q)));
      self.itemsEl.innerHTML = list.length
        ? list
            .map((it) => {
              const title = (it[cfg.title] || '').trim();
              const sub = cfg.subFn ? cfg.subFn(it) : it[cfg.sub] || '';
              return `<div class="le-item ${it.id === self.sel ? 'active' : ''}" data-id="${it.id}">
                <span class="avatar" style="--c:${it.color}">${esc((title.charAt(0) || '?').toUpperCase())}</span>
                <div class="le-txt"><div class="le-t">${esc(title || t(cfg.untitled))}</div><div class="le-s">${esc(sub)}</div></div></div>`;
            })
            .join('')
        : `<div class="le-empty">${t(items().length ? 'nothing_found' : cfg.empty)}</div>`;
    };

    self.renderForm = () => {
      const it = find(self.sel);
      if (!it) {
        self.formEl.innerHTML = `<div class="form-inner"><div class="empty"><div class="big">${cfg.emoji}</div>${t(cfg.emptyForm)}</div></div>`;
        return;
      }
      self.formEl.innerHTML = `<div class="form-inner" style="--c:${it.color}">
        <input class="big-name" data-k="${cfg.title}" placeholder="${t(cfg.titlePh)}" value="${esc(it[cfg.title] || '')}">
        ${cfg.mentions ? '<div class="mentions"></div>' : ''}
        ${cfg.fields
          .map(
            (f) => `<div class="fld"><label>${t(f.label)}</label>${
              f.type === 'area'
                ? `<textarea class="inp ${f.cls || ''}" rows="${f.rows || 4}" data-k="${f.k}" placeholder="${f.ph ? t(f.ph) : ''}">${esc(it[f.k] || '')}</textarea>`
                : `<input class="inp" data-k="${f.k}" value="${esc(it[f.k] || '')}" placeholder="${f.ph ? t(f.ph) : ''}">`
            }</div>`
          )
          .join('')}
        <div class="fld"><label>${t('color')}</label><div class="swatches">${App.COLORS.map((c) => `<span class="sw ${c === it.color ? 'on' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}</div></div>
        <button class="btn danger le-del">${icon('trash')}<span>${t('delete')}</span></button>
      </div>`;
      if (cfg.mentions) self.renderMentions(it);
    };

    self.renderMentions = (it) => {
      const box = App.$('.mentions', self.formEl);
      if (!box) return;
      const res = App.mentions(it[cfg.title]);
      box.innerHTML = res.length
        ? `<span>${t('mentioned_in')}</span>` +
          res.map((r) => `<button class="chip" data-mch="${r.c.id}" data-stem="${esc(r.stem)}" style="border-color:${r.c.color}">${esc(App.chapterLabel(r.c))} · ${r.n}</button>`).join('')
        : `<span>${t((it[cfg.title] || '').trim() ? 'mentioned_none' : 'mentioned_hint')}</span>`;
    };

    App.on('lang', () => {
      if (!self.root) return;
      self.mount(self.root);
      self.show();
    });
    App.on('data-reset', () => {
      self.sel = null;
      if (self.root && self.root.offsetParent) self.show();
    });
    return self;
  };

  /* =================== ПЕРСОНАЖИ =================== */
  App.Chars = App.ListEditor({
    key: 'characters',
    title: 'name',
    sub: 'role',
    titleKey: 'tab_chars',
    titlePh: 'char_name_ph',
    untitled: 'untitled_char',
    empty: 'no_chars',
    emptyForm: 'chars_empty_form',
    emoji: '👤',
    mentions: true,
    fields: [
      { k: 'role', label: 'f_role', ph: 'f_role_ph' },
      { k: 'age', label: 'f_age' },
      { k: 'looks', label: 'f_looks', type: 'area', rows: 3, ph: 'f_looks_ph' },
      { k: 'traits', label: 'f_traits', type: 'area', rows: 3, ph: 'f_traits_ph' },
      { k: 'bio', label: 'f_bio', type: 'area', rows: 6 },
    ],
  });

  /* =================== ЗАМЕТКИ =================== */
  App.Notes = App.ListEditor({
    key: 'notes',
    title: 'title',
    titleKey: 'tab_notes',
    titlePh: 'note_title_ph',
    untitled: 'untitled_note',
    empty: 'no_notes',
    emptyForm: 'notes_empty_form',
    emoji: '📝',
    prepend: true,
    subFn: (it) => (it.body || '').split('\n').find((l) => l.trim()) || '',
    fields: [{ k: 'body', label: 'f_body', type: 'area', rows: 16, cls: 'note-body', ph: 'f_body_ph' }],
  });

  /* =================== МИР: места и хронология =================== */
  const Places = App.ListEditor({
    key: 'places',
    title: 'name',
    sub: 'kind',
    titleKey: 'places',
    titlePh: 'place_name_ph',
    untitled: 'untitled_place',
    empty: 'no_places',
    emptyForm: 'places_empty_form',
    emoji: '🗺️',
    mentions: true,
    fields: [
      { k: 'kind', label: 'f_kind', ph: 'f_kind_ph' },
      { k: 'desc', label: 'f_desc', type: 'area', rows: 5 },
      { k: 'notes', label: 'f_notes', type: 'area', rows: 4 },
    ],
  });

  const Timeline = {
    mount(root) {
      root.innerHTML = `<div class="page-wrap"><div class="page-inner narrow">
        <h1 class="pg" data-i18n="timeline"></h1>
        <p class="pg-sub" data-i18n="timeline_sub"></p>
        <div class="tl"></div>
        <button class="btn primary tl-add">${icon('plus')}<span data-i18n="add_event"></span></button>
      </div></div>`;
      App.applyI18n(root);
      this.root = root;
      this.tl = App.$('.tl', root);
      App.$('.tl-add', root).addEventListener('click', () => {
        App.data.timeline.push({ id: App.uid(), when: '', title: '', desc: '', chapter: '' });
        App.save();
        this.render();
        const inps = App.$$('.ev-title', this.tl);
        if (inps.length) inps[inps.length - 1].focus();
      });
      this.tl.addEventListener('input', (e) => {
        const k = e.target.dataset.k;
        const ev = this.find(e.target);
        if (!k || !ev) return;
        ev[k] = e.target.value;
        App.save();
        if (k === 'chapter') this.render();
      });
      this.tl.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        const ev = this.find(b);
        const arr = App.data.timeline;
        const i = arr.indexOf(ev);
        if (b.dataset.a === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        else if (b.dataset.a === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        else if (b.dataset.a === 'del') {
          if (!(await App.confirm(t('del_item_q', { name: ev.title || t('untitled_event') }), t('delete'), true))) return;
          arr.splice(i, 1);
        } else if (b.dataset.a === 'open' && ev.chapter) {
          App.go('editor');
          App.Editor.select(ev.chapter);
          return;
        }
        App.save();
        this.render();
      });
    },
    find(node) {
      const card = node.closest('.ev');
      return card && App.data.timeline.find((x) => x.id === card.dataset.id);
    },
    render() {
      const chs = App.data.book.chapters;
      this.tl.innerHTML =
        App.data.timeline
          .map((ev) => {
            const c = App.chapter(ev.chapter);
            return `<div class="ev" data-id="${ev.id}" style="--c:${c ? c.color : 'var(--text-faint)'}">
              <div class="ev-row">
                <input class="inp ev-when" data-k="when" value="${esc(ev.when)}" placeholder="${t('ev_when_ph')}">
                <input class="inp ev-title" data-k="title" value="${esc(ev.title)}" placeholder="${t('ev_title_ph')}">
              </div>
              <textarea class="inp" rows="2" data-k="desc" placeholder="${t('ev_desc_ph')}">${esc(ev.desc)}</textarea>
              <div class="ev-row" style="margin-top:8px">
                <select class="inp" data-k="chapter"><option value="">${t('no_chapter')}</option>${chs
                  .map((ch) => `<option value="${ch.id}" ${ch.id === ev.chapter ? 'selected' : ''}>${esc(App.chapterLabel(ch))}</option>`)
                  .join('')}</select>
                ${c ? `<button class="link-btn" data-a="open">${icon('arrow')}${t('open_chapter')}</button>` : ''}
                <span style="flex:1"></span>
                <button class="icon-btn" data-a="up" title="${t('move_up')}">${icon('up')}</button>
                <button class="icon-btn" data-a="down" title="${t('move_down')}">${icon('down')}</button>
                <button class="icon-btn" data-a="del" title="${t('delete')}">${icon('trash')}</button>
              </div>
            </div>`;
          })
          .join('') || `<div class="empty" style="margin-left:-30px"><div class="big">🕰️</div>${t('timeline_empty')}</div>`;
    },
  };

  App.World = {
    sub: 'places',
    mount(root) {
      root.innerHTML = `<div class="world">
        <div class="subtabs">
          <button class="subtab" data-s="places">${icon('map')}<span data-i18n="places"></span></button>
          <button class="subtab" data-s="timeline">${icon('clock')}<span data-i18n="timeline"></span></button>
        </div>
        <div class="world-body w-places"></div>
        <div class="world-body w-timeline"></div>
      </div>`;
      this.root = root;
      Places.mount(App.$('.w-places', root));
      Timeline.mount(App.$('.w-timeline', root));
      App.$('.subtabs', root).addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        this.sub = b.dataset.s;
        this.show();
      });
      App.on('lang', () => this.mounted && App.route === 'world' && this.show());
      App.on('data-reset', () => this.mounted && App.route === 'world' && this.show());
    },
    show() {
      App.$$('.subtab', this.root).forEach((b) => b.classList.toggle('on', b.dataset.s === this.sub));
      App.$('.w-places', this.root).classList.toggle('hidden', this.sub !== 'places');
      App.$('.w-timeline', this.root).classList.toggle('hidden', this.sub !== 'timeline');
      if (this.sub === 'places') Places.show();
      else Timeline.render();
    },
  };
})();
