'use strict';
/* =========================================================
   «Карта глав» — доска с карточками глав.
   По статусу: колонки Тезисы / Черновик / Готово.
     Перетащил карточку в другую колонку — сменился статус.
     Порядок карточек = порядок глав в книге.
   Сюжетная лента: все главы в ряд, по порядку книги.
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const esc = (s) => App.esc(s);
  const KEY = 'chernilnitsa.board';

  App.Board = {
    mode: App.lsGet(KEY) === 'line' ? 'line' : 'status',

    mount(root) {
      this.root = root;
      root.innerHTML = `<div class="board">
        <div class="bd-head">
          <span class="bd-title">${App.icon('board')}<span data-i18n="tab_board"></span></span>
          <span class="bd-sub"></span>
          <span class="sp"></span>
          <div class="seg bd-mode"><button data-m="status" data-i18n="bd_status"></button><button data-m="line" data-i18n="bd_line"></button></div>
        </div>
        <div class="bd-body"></div>
        <div class="bd-foot">
          <span>${App.icon('arrow')}<span data-i18n="bd_hint_click"></span></span>
          <span>${App.icon('repeat')}<span data-i18n="bd_hint_order"></span></span>
        </div>
      </div>`;
      this.body = App.$('.bd-body', root);
      App.$('.bd-mode', root).addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        this.mode = b.dataset.m;
        App.lsSet(KEY, this.mode);
        this.render();
      });
      this.body.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) return this.add();
        const card = e.target.closest('.bd-card');
        if (card) this.open(card.dataset.id);
      });
      this.body.addEventListener('keydown', (e) => {
        const card = e.target.closest('.bd-card');
        if (card && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          this.open(card.dataset.id);
        }
      });
      this.bindDrag();
      const again = () => App.route === 'board' && this.render();
      App.on('issues', again);
      App.on('data-reset', again);
      App.on('lang', again);
    },
    show() {
      this.render();
    },

    /* --- Данные для карточек --- */
    // Какие персонажи упоминаются в каждой главе
    castMap() {
      const map = {};
      App.data.characters.forEach((p) => {
        App.mentions(p.name).forEach(({ c }) => (map[c.id] = map[c.id] || []).push(p));
      });
      return map;
    },
    // «Нормальная» длина главы: середина готовых глав (или 1500 слов, пока готовых нет)
    refWords() {
      const done = App.data.book.chapters.filter((c) => c.status === 'done').map((c) => App.words(c.text)).sort((a, b) => a - b);
      return done.length ? Math.max(300, done[(done.length / 2) | 0]) : 1500;
    },

    card(c, ctx, i) {
      const words = App.words(c.text);
      const src = (c.thesis.trim() || c.text.trim()).split('\n').find((l) => l.trim()) || '';
      const snip = src.length > 110 ? src.slice(0, 108).trimEnd() + '…' : src;
      const q = ((c.thesis + '\n' + c.text).match(/\[[^\]\n]*\?\]/g) || []).length;
      const iss = ctx.iss[c.id] || 0;
      const cast = (ctx.cast[c.id] || []).slice(0, 5);
      const prog = c.status === 'draft' ? Math.min(1, words / ctx.ref) : 0;
      const line = this.mode === 'line';
      return `<article class="bd-card ${c.id === App.data.settings.active ? 'cur' : ''}" draggable="true" tabindex="0" data-id="${c.id}" style="--c:${c.color}">
        <div class="bd-top">
          ${line ? `<span class="bd-num">${i + 1}</span>` : '<span class="bd-bar"></span>'}
          <span class="bd-name">${esc(App.chapterLabel(c))}</span>
          <span class="bd-w">${t('bd_words', { n: App.fmt(words) })}</span>
        </div>
        ${line ? `<span class="bd-st" style="--s:var(--st-${c.status})">${t('st_' + c.status)}</span>` : ''}
        ${snip ? `<div class="bd-snip">${esc(snip)}</div>` : `<div class="bd-snip empty">${t('bd_nothesis')}</div>`}
        ${prog ? `<div class="bd-prog" title="${t('bd_prog_tip', { p: Math.round(prog * 100) })}"><i style="width:${Math.max(4, prog * 100)}%"></i></div>` : ''}
        ${cast.length || q || iss ? `<div class="bd-meta">
          ${cast.map((p) => `<span class="bd-av" style="--a:${p.color}" title="${esc(p.name)}">${esc((p.name || '?').trim()[0] || '?')}</span>`).join('')}
          <span class="sp"></span>
          ${q ? `<span class="bd-badge warn" title="${t('bd_q_tip')}">[?] ${q}</span>` : ''}
          ${iss ? `<span class="bd-badge err" title="${t('tab_pravki')}">${t('bd_iss', { n: iss })}</span>` : ''}
        </div>` : ''}
      </article>`;
    },

    render() {
      if (!this.root) return;
      const d = App.data, chs = d.book.chapters;
      App.$$('.bd-mode button', this.root).forEach((b) => b.classList.toggle('on', b.dataset.m === this.mode));
      let w = 0;
      chs.forEach((c) => (w += App.words(c.text)));
      App.$('.bd-sub', this.root).textContent = t('bd_sub', { n: chs.length, w: App.fmt(w) });
      const iss = {};
      d.issues.forEach((x) => (iss[x.ch] = (iss[x.ch] || 0) + 1));
      const ctx = { iss, cast: this.castMap(), ref: this.refWords() };
      if (this.mode === 'line') {
        this.body.className = 'bd-body line';
        this.body.innerHTML = `<div class="bd-lane">${chs.map((c, i) => this.card(c, ctx, i)).join('')}
          <button class="bd-add" data-add>+ ${t('bd_add')}</button></div>`;
      } else {
        this.body.className = 'bd-body cols';
        this.body.innerHTML = App.STATUSES.map((s) => {
          const list = chs.filter((c) => c.status === s);
          return `<section class="bd-col" data-st="${s}">
            <div class="bd-ch"><i style="background:var(--st-${s})"></i>${t('st_' + s)}<span>${list.length}</span></div>
            <div class="bd-list">${list.map((c) => this.card(c, ctx)).join('') || `<div class="bd-empty">${t('bd_empty')}</div>`}</div>
            ${s === 'thesis' ? `<button class="bd-add" data-add>+ ${t('bd_add')}</button>` : ''}
          </section>`;
        }).join('');
      }
    },

    open(id) {
      App.data.settings.active = id;
      App.save();
      App.go('editor');
    },
    add() {
      App.go('editor');
      App.Editor.addChapter();
    },

    /* --- Перетаскивание карточек --- */
    bindDrag() {
      const B = this.body;
      const clear = () => App.$$('.drop-before,.drop-after,.dragging,.over', B).forEach((x) => x.classList.remove('drop-before', 'drop-after', 'dragging', 'over'));
      B.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.bd-card');
        if (!card) return;
        this.dragId = card.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dragId);
        requestAnimationFrame(() => card.classList.add('dragging'));
      });
      B.addEventListener('dragover', (e) => {
        if (!this.dragId) return;
        const col = e.target.closest('.bd-col');
        const card = e.target.closest('.bd-card');
        if (!col && !card) return;
        e.preventDefault();
        App.$$('.drop-before,.drop-after,.over', B).forEach((x) => x.classList.remove('drop-before', 'drop-after', 'over'));
        if (col) col.classList.add('over');
        if (card && card.dataset.id !== this.dragId) {
          const r = card.getBoundingClientRect();
          const before = this.mode === 'line' ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
          card.classList.add(before ? 'drop-before' : 'drop-after');
        }
      });
      B.addEventListener('drop', (e) => {
        e.preventDefault();
        const id = this.dragId;
        if (!id) return clear();
        const arr = App.data.book.chapters;
        const ch = App.chapter(id);
        const target = App.$('.drop-before, .drop-after', B);
        const col = e.target.closest('.bd-col');
        const moved = col && col.dataset.st !== ch.status;
        if (col) ch.status = col.dataset.st; // другая колонка = другой статус
        if (target) {
          const before = target.classList.contains('drop-before');
          arr.splice(App.chapterIndex(id), 1);
          arr.splice(App.chapterIndex(target.dataset.id) + (before ? 0 : 1), 0, ch);
        } else if (moved) {
          // В пустое место колонки: глава встаёт после последней главы с этим статусом
          const same = arr.filter((c) => c.status === ch.status && c.id !== id);
          if (same.length) {
            arr.splice(App.chapterIndex(id), 1);
            arr.splice(App.chapterIndex(same[same.length - 1].id) + 1, 0, ch);
          }
        }
        App.save();
        this.dragId = null;
        clear();
        this.render();
        if (App.Editor.mounted) {
          if (App.data.settings.active === id) App.Editor.renderHead();
          App.Editor.renderList();
        }
      });
      B.addEventListener('dragend', () => {
        this.dragId = null;
        clear();
      });
    },
  };
})();
