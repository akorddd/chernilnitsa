'use strict';
/* =========================================================
   Запуск: вкладки, строка состояния, таймер, меню, настройки
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const $ = App.$;

  /* ---------- Строка состояния ---------- */
  App.Status = {
    init() {
      this.save = $('.sb-save');
      App.on('saving', () => this.setSave('saving'));
      App.on('saved', () => this.setSave('saved'));
      App.on('save-error', () => this.setSave('error'));
      App.on('typing', () => this.update());
      App.on('lang', () => {
        this.update();
        this.setSave(this.saveState || 'saved');
        this.limit();
      });
      App.on('data-reset', () => this.update());
      App.on('check-start', () => $('.sb-check').classList.remove('hidden'));
      App.on('check-end', () => {
        $('.sb-check').classList.add('hidden');
        this.limit();
      });
      App.on('limit', () => this.limit());
      setInterval(() => this.limit(), 5000);
      this.setSave('saved');
      this.limit();
    },
    setSave(st) {
      this.saveState = st;
      const el = this.save;
      el.className = 'sb-item sb-save ' + (st === 'saved' ? 'ok' : st === 'error' ? 'err' : '');
      el.textContent = st === 'saved' ? '✓ ' + t('saved') : st === 'error' ? '⚠ ' + t('save_error') : t('saving');
    },
    update() {
      const d = App.data;
      if (!d) return;
      if (App.route === 'editor') {
        const c = App.active();
        $('.sb-ch').textContent = App.chapterLabel(c);
        $('.sb-ch').classList.remove('hidden');
        $('.sb-words').textContent = t('sb_words', { n: App.fmt(App.words(c.text)), c: App.fmt(c.text.length) });
      } else {
        $('.sb-ch').classList.add('hidden');
        let w = 0;
        d.book.chapters.forEach((c) => (w += App.words(c.text)));
        $('.sb-words').textContent = t('sb_book', { n: App.fmt(w), ch: d.book.chapters.length });
      }
    },
    limit() {
      const u = App.Checker.usage();
      const pct = Math.min(100, (u.bytes / App.Checker.LIMIT_BYTES) * 100);
      const m = $('.sb-limit .meter');
      m.firstElementChild.style.width = pct + '%';
      m.classList.toggle('hot', pct > 70);
      $('.sb-limit .val').textContent = `${(u.bytes / 1000).toFixed(1)} / 75 KB · ${u.reqs}/20`;
    },
  };

  /* ---------- Таймер «работа / отдых» ---------- */
  App.Timer = {
    mode: 'work',
    left: null,
    run: false,
    iv: null,
    base: document.title,
    dur() {
      const s = App.data.settings;
      return Math.max(1, +(this.mode === 'work' ? s.work : s.rest) || 1) * 60;
    },
    toggle() {
      if (this.left == null) this.left = this.dur();
      this.run = !this.run;
      clearInterval(this.iv);
      if (this.run) {
        this.endAt = Date.now() + this.left * 1000;
        this.iv = setInterval(() => this.tick(), 500);
      }
      this.render();
    },
    tick() {
      this.left = Math.max(0, Math.round((this.endAt - Date.now()) / 1000));
      if (this.left <= 0) this.finish();
      this.render();
    },
    finish() {
      clearInterval(this.iv);
      this.run = false;
      this.beep();
      App.toast(t(this.mode === 'work' ? 'timer_work_done' : 'timer_rest_done'), 'ok');
      this.mode = this.mode === 'work' ? 'rest' : 'work';
      this.left = this.dur();
    },
    reset() {
      clearInterval(this.iv);
      this.run = false;
      this.mode = 'work';
      this.left = null;
      this.render();
    },
    beep() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.35, 0.7].forEach((at) => {
          const o = ctx.createOscillator(),
            g = ctx.createGain();
          o.frequency.value = 880;
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
          g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.25);
          o.start(ctx.currentTime + at);
          o.stop(ctx.currentTime + at + 0.3);
        });
      } catch (e) {}
    },
    render() {
      const s = this.left == null ? this.dur() : this.left;
      const mm = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      const box = $('.timer');
      box.classList.toggle('run', this.run && this.mode === 'work');
      box.classList.toggle('rest', this.mode === 'rest');
      $('.t-time').textContent = mm;
      $('.t-mode').textContent = this.left == null && !this.run ? '' : t(this.mode === 'work' ? 'timer_work' : 'timer_rest');
      const svg = $('.t-toggle svg');
      if (svg) svg.outerHTML = App.icon(this.run ? 'pause' : 'clock');
      document.title = this.run ? `${mm} · ${t('app_name')}` : t('app_name');
    },
  };

  /* ---------- Вкладки (страницы сайта) ---------- */
  const VIEWS = { editor: App.Editor, pravki: App.Pravki, syn: App.Syn, chars: App.Chars, world: App.World, notes: App.Notes };
  App.route = null;
  App.router = () => {
    let r = location.hash.slice(1);
    if (!VIEWS[r]) r = 'editor';
    if (r === App.route) return;
    App.route = r;
    App.Popup.hide();
    if (r !== 'editor') {
      if (document.body.classList.contains('focus')) App.Editor.toggleFocus(false);
      if (App.TTS.on) App.TTS.stop();
    }
    App.$$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === r));
    App.$$('.tab').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
    const view = VIEWS[r];
    const el = $(`.view[data-view="${r}"]`);
    if (!view.mounted) {
      view.mount(el);
      App.applyI18n(el);
      view.mounted = true;
    }
    view.show();
    if (r === 'pravki' && App.data.unseen) {
      App.data.unseen = false;
      App.save();
    }
    App.updateDot();
    App.Status.update();
  };
  App.go = (r) => {
    if (location.hash.slice(1) !== r) location.hash = r;
    App.router();
  };
  // Точка на «Правках»: появились новые замечания, которые вы ещё не смотрели
  App.updateDot = () => $('.tab[data-route="pravki"] .dot').classList.toggle('hidden', !App.data.unseen);

  /* ---------- Меню «Файл» ---------- */
  function bindMenu() {
    const menu = $('.menu');
    $('.menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('.demo-label').textContent = t(App.mode === 'demo' ? 'm_demo_off' : 'm_demo_on');
      menu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) menu.classList.add('hidden');
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || (!menu.contains(b) && !b.closest('.demo-banner'))) return;
      menu.classList.add('hidden');
      const a = b.dataset.act;
      if (a === 'import') App.IO.importMd();
      else if (a === 'export') App.IO.exportMd();
      else if (a === 'backup') App.IO.backup();
      else if (a === 'restore') App.IO.restore();
      else if (a === 'demo') toggleDemo();
      else if (a === 'demo-reset') App.resetDemo();
      else if (a === 'settings') openSettings();
      else if (a === 'help') openHelp();
    });
  }

  function toggleDemo() {
    App.setMode(App.mode === 'demo' ? 'real' : 'demo');
    App.toast(t(App.mode === 'demo' ? 'demo_on_toast' : 'demo_off_toast'), 'ok');
  }

  function applyMode() {
    $('.demo-banner').classList.toggle('hidden', App.mode !== 'demo');
  }

  function applySettings() {
    const s = App.data.settings;
    document.documentElement.style.setProperty('--fs', (+s.fontSize || 18) + 'px');
    document.documentElement.style.setProperty('--font-text', s.font === 'sans' ? 'var(--font-ui)' : 'var(--font-serif)');
    App.$$('.hl-ta').forEach((ta) => (ta.spellcheck = !!s.native));
    if (App.Editor.mounted && App.route === 'editor') {
      App.Editor.thesisHL.fit();
      App.Editor.textHL.fit();
    }
    if (!App.Timer.run) App.Timer.left = null;
    App.Timer.render();
  }

  async function openSettings() {
    const s = App.data.settings;
    const body = App.el(`<div>
      <div class="set-row"><span>${t('set_check_lang')}</span><select class="inp" name="checkLang"><option value="ru-RU">Русский</option><option value="en-US">English (US)</option><option value="auto">${t('auto')}</option></select></div>
      <div class="set-row"><span>${t('set_font')}</span><select class="inp" name="font"><option value="serif">${t('font_serif')}</option><option value="sans">${t('font_sans')}</option></select></div>
      <div class="set-row"><span>${t('set_font_size')}</span><input class="inp" type="number" min="13" max="28" name="fontSize"></div>
      <div class="set-row"><span>${t('set_native')}<br><small style="color:var(--text-dim)">${t('set_native_hint')}</small></span><input type="checkbox" name="native"></div>
      <div class="set-row"><span>${t('set_work')}</span><input class="inp" type="number" min="1" max="120" name="work"></div>
      <div class="set-row"><span>${t('set_rest')}</span><input class="inp" type="number" min="1" max="60" name="rest"></div>
    </div>`);
    App.$$('[name]', body).forEach((el) => {
      if (el.type === 'checkbox') el.checked = !!s[el.name];
      else el.value = s[el.name];
    });
    const res = await App.modal({
      title: t('m_settings'),
      body,
      buttons: [
        { label: t('cancel'), value: null },
        {
          label: t('save'),
          primary: true,
          value: (mb) => {
            const o = {};
            App.$$('[name]', mb).forEach((el) => (o[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value));
            return o;
          },
        },
      ],
    });
    if (!res) return;
    res.fontSize = Math.min(28, Math.max(13, res.fontSize || 18));
    Object.assign(App.data.settings, res);
    App.save();
    applySettings();
  }

  App.openHelp = openHelp;
  function openHelp() {
    App.modal({
      title: t('m_help'),
      wide: true,
      body: `<ul class="help-list">${t('help_html')}</ul>`,
    });
  }

  /* ---------- Горячие клавиши ---------- */
  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      // e.code не зависит от раскладки: Ctrl+S работает и на русской
      if (mod && e.code === 'KeyS') {
        e.preventDefault();
        if (App.route === 'editor') App.Editor.saveAndCheck();
        else {
          App.saveNow();
          App.toast(t('saved'), 'ok');
        }
      } else if (mod && (e.code === 'KeyF' || e.code === 'KeyH') && App.route === 'editor') {
        e.preventDefault();
        App.Editor.openFind();
      } else if (e.key === 'Escape') {
        if (App.Popup.el) App.Popup.hide();
        else if (App.TTS.on) App.TTS.stop();
        else if (document.body.classList.contains('focus')) App.Editor.toggleFocus(false);
        else if (App.Editor.findOpen()) App.Editor.closeFind();
      }
    });
  }

  /* ---------- Старт ---------- */
  function init() {
    App.load();
    document.documentElement.lang = App.lang;
    App.$$('[data-icon]').forEach((el) => (el.outerHTML = App.icon(el.dataset.icon)));
    App.applyI18n(document);

    App.$$('.flag').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === App.lang);
      b.addEventListener('click', () => {
        App.setLang(b.dataset.lang);
        App.$$('.flag').forEach((x) => x.classList.toggle('active', x.dataset.lang === App.lang));
      });
    });

    App.Status.init();
    $('.t-toggle').addEventListener('click', () => App.Timer.toggle());
    $('.t-reset').addEventListener('click', () => App.Timer.reset());
    $('.focus-exit').addEventListener('click', () => App.Editor.toggleFocus(false));
    App.on('lang', () => App.Timer.render());
    App.on('issues', () => App.updateDot());
    App.on('data-reset', () => {
      applyMode();
      applySettings();
      App.updateDot();
    });

    bindMenu();
    bindKeys();
    App.Theme.init();
    App.Support.init();
    applyMode();
    applySettings();
    window.addEventListener('hashchange', App.router);
    App.router();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
