'use strict';
/* =========================================================
   Оформление: темы, узоры, падающие лепестки.
   Поддержка: окно помощи и «сообщить об ошибке».
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const $ = App.$;

  /* ---------- Темы ---------- */
  // group: work — холодные, для офиса; home — уютные, с узорами
  App.THEMES = [
    { id: 'ink', group: 'work', fall: 0 },
    { id: 'fjord', group: 'work', fall: 0 },
    { id: 'frost', group: 'work', fall: 0 },
    { id: 'sakura', group: 'home', fall: 18 },
    { id: 'yozakura', group: 'home', fall: 16 },
    { id: 'ginkgo', group: 'home', fall: 10 },
    { id: 'olive', group: 'home', fall: 9 },
    { id: 'world', group: 'special', fall: 0 }, // фон рисует сам сайт по тексту книги (world.js)
  ];
  const KEY = 'chernilnitsa.theme'; // тема общая для настоящей книги и демо, поэтому хранится отдельно

  App.Theme = {
    s: { id: 'ink', pattern: true, motion: true },

    load() {
      try {
        Object.assign(this.s, JSON.parse(App.lsGet(KEY) || '{}'));
      } catch (e) {}
      if (!this.cur()) this.s.id = 'ink';
    },
    cur() {
      return App.THEMES.find((x) => x.id === this.s.id);
    },
    set(patch) {
      Object.assign(this.s, patch);
      App.lsSet(KEY, JSON.stringify(this.s));
      this.apply();
    },
    apply() {
      const root = document.documentElement;
      root.setAttribute('data-theme', this.s.id);
      root.classList.toggle('no-pattern', !this.s.pattern);
      this.fall();
      if (App.World3D) App.World3D.sync();
      if (!this.pop.classList.contains('hidden')) this.render();
    },

    // Падающие лепестки/листья: несколько картинок с CSS-анимацией
    fall() {
      let box = $('.fall');
      const n = this.s.pattern && this.s.motion ? this.cur().fall : 0;
      if (!n) return box && box.remove();
      if (box && +box.dataset.n === n) return;
      if (box) box.remove();
      box = document.createElement('div');
      box.className = 'fall';
      box.dataset.n = n;
      const rnd = (a, b) => a + Math.random() * (b - a);
      for (let i = 0; i < n; i++) {
        const p = document.createElement('i');
        const size = rnd(10, 20);
        p.style.cssText =
          `left:${rnd(0, 100)}%;width:${size}px;height:${size * 1.15}px;` +
          `animation-duration:${rnd(14, 26)}s;animation-delay:${-rnd(0, 26)}s;--sway:${rnd(-80, 80)}px;opacity:0`;
        box.appendChild(p);
      }
      document.body.prepend(box);
    },

    tile(th) {
      return `<button class="th-tile ${th.id === this.s.id ? 'on' : ''}" data-th="${th.id}">
        <span class="th-prev" data-theme="${th.id}"><i class="th-side"></i><i class="th-acc"></i><i class="th-sheet"></i></span>
        <span class="th-name">${t('th_' + th.id)}</span>
      </button>`;
    },
    render() {
      const grp = (g) => App.THEMES.filter((x) => x.group === g).map((x) => this.tile(x)).join('');
      const sw = (opt, on, dis) =>
        `<span class="switch"><input type="checkbox" data-opt="${opt}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}><i></i></span>`;
      this.pop.innerHTML = `
        <div class="pop-title">${t('theme_title')}</div>
        <div class="pop-sub">${t('theme_sub')}</div>
        <div class="th-lbl">${t('th_group_work')}</div><div class="th-grid">${grp('work')}</div>
        <div class="th-lbl">${t('th_group_home')}</div><div class="th-grid">${grp('home')}</div>
        <div class="th-lbl">${t('th_group_special')}</div>
        <div class="th-world">${grp('special')}<div class="th-world-txt">${t('th_world_hint')}
          ${this.s.id === 'world' ? `<button class="btn sm primary" data-peek>${App.icon('globe')}${t('th_world_peek')}</button>` : ''}</div></div>
        <div class="th-opts">
          <label class="th-opt"><span>${t('th_pattern')}<small>${t('th_pattern_hint')}</small></span>${sw('pattern', this.s.pattern)}</label>
          <label class="th-opt"><span>${t('th_motion')}<small>${t('th_motion_hint')}</small></span>${sw('motion', this.s.motion, !this.s.pattern)}</label>
        </div>`;
    },

    init() {
      this.load();
      this.btn = $('.theme-btn');
      this.pop = $('.theme-pop');
      this.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = this.pop.classList.contains('hidden');
        if (open) this.render();
        this.pop.classList.toggle('hidden', !open);
        this.btn.classList.toggle('on', open);
      });
      this.pop.addEventListener('click', (e) => {
        e.stopPropagation();
        const tile = e.target.closest('[data-th]');
        if (tile) this.set({ id: tile.dataset.th });
        if (e.target.closest('[data-peek]')) {
          this.pop.classList.add('hidden');
          this.btn.classList.remove('on');
          App.World3D.peek(true);
        }
      });
      this.pop.addEventListener('change', (e) => {
        const o = e.target.dataset.opt;
        if (o) {
          this.set({ [o]: e.target.checked });
          this.render();
        }
      });
      document.addEventListener('click', () => {
        this.pop.classList.add('hidden');
        this.btn.classList.remove('on');
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.pop.classList.add('hidden');
          this.btn.classList.remove('on');
        }
      });
      App.on('lang', () => !this.pop.classList.contains('hidden') && this.render());
      this.apply();
    },
  };

  /* ---------- Поддержка ---------- */
  const REPO = 'https://github.com/akorddd/chernilnitsa';

  App.Support = {
    // Технические данные для отчёта об ошибке. Текста книги здесь нет.
    diag() {
      return [
        `${t('app_name')} v${App.VERSION}`,
        `Browser: ${navigator.userAgent}`,
        `Screen: ${innerWidth}×${innerHeight}`,
        `Lang: ${App.lang} · Theme: ${App.Theme.s.id} · Mode: ${App.mode} · Page: ${App.route}`,
      ].join('\n');
    },
    issueUrl(kind) {
      const title = t(kind === 'bug' ? 'sup_bug_title' : 'sup_idea_title');
      let body = t(kind === 'bug' ? 'sup_bug_body' : 'sup_idea_body');
      if (kind === 'bug') body += '\n\n---\n' + this.diag();
      return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    },
    async open() {
      const faq = [1, 2, 3, 4, 5]
        .map((i) => `<details class="faq"><summary>${t('faq_q' + i)}</summary><p>${t('faq_a' + i)}</p></details>`)
        .join('');
      const body = App.el(`<div>
        <p class="sup-intro">${t('sup_intro')}</p>
        <div class="sup-cards">
          <a class="sup-card t-spell" href="${this.issueUrl('bug')}" target="_blank" rel="noopener">
            <span class="sup-ic">${App.icon('bug')}</span><b>${t('sup_bug')}</b><small>${t('sup_bug_hint')}</small></a>
          <a class="sup-card t-grammar" href="${this.issueUrl('idea')}" target="_blank" rel="noopener">
            <span class="sup-ic">${App.icon('bulb')}</span><b>${t('sup_idea')}</b><small>${t('sup_idea_hint')}</small></a>
          <button class="sup-card t-style" data-sup="copy">
            <span class="sup-ic">${App.icon('copy')}</span><b>${t('sup_copy')}</b><small>${t('sup_copy_hint')}</small></button>
        </div>
        <div class="lbl">${t('sup_faq')}</div>
        ${faq}
        <p class="sup-foot">${t('app_name')} v${App.VERSION} · <a href="${REPO}" target="_blank" rel="noopener">${t('sup_source')}</a></p>
      </div>`);
      body.querySelector('[data-sup="copy"]').addEventListener('click', async () => {
        const ok = await App.copy(this.diag());
        App.toast(t(ok ? 'sup_copied' : 'sup_copy_fail'), ok ? 'ok' : 'err');
      });
      const res = await App.modal({
        title: t('support'),
        wide: true,
        body,
        buttons: [
          { label: t('sup_full_help'), value: 'help' },
          { label: t('close'), value: null, primary: true },
        ],
      });
      if (res === 'help') App.openHelp();
    },
    init() {
      $('.support-btn').addEventListener('click', () => this.open());
    },
  };
})();
