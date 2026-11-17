'use strict';
/* =========================================================
   Экспорт в PDF «как настоящая книга».
   Сайт собирает книгу в скрытый блок #print-root и вызывает
   печать браузера: там выбираем «Сохранить как PDF».
   Стиль берётся из текущей темы: цвета, орнамент, шрифты.
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const esc = (s) => App.esc(s);

  App.Export = {
    o: { look: 'site', size: 'A5', which: 'all', author: '' },

    // Абзацы: пустая строка = новый абзац, перенос строки = <br>
    paras(text) {
      return String(text || '')
        .replace(/\r\n?/g, '\n')
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
        .join('');
    },

    build(o) {
      const d = App.data;
      const list = d.book.chapters.filter((c) => c.text.trim() && (o.which === 'all' || c.status === 'done'));
      if (!list.length) return null;
      const title = d.book.title.trim() || t('untitled_book');
      const th = App.Theme.cur();
      const orn = th && th.fall ? '<i class="pr-orn img"></i>' : '<i class="pr-orn">❦</i>';
      let h = `<section class="pr-title">
          ${orn}
          <h1>${esc(title)}</h1>
          ${o.author.trim() ? `<div class="pr-author">${esc(o.author.trim())}</div>` : ''}
          <div class="pr-year">${new Date().getFullYear()}</div>
        </section>`;
      if (list.length > 1) {
        h += `<section class="pr-toc"><h2>${t('pdf_toc')}</h2><ol>${list
          .map((c) => `<li><span style="--c:${c.color}"></span>${esc(App.chapterLabel(c))}</li>`)
          .join('')}</ol></section>`;
      }
      list.forEach((c, i) => {
        const label = /^\d+$/.test(c.title.trim()) ? '' : esc(c.title.trim());
        h += `<section class="pr-ch" style="--c:${c.color}">
            <div class="pr-num">${t('pdf_chapter')} ${i + 1}</div>
            ${label ? `<h2>${label}</h2>` : ''}
            ${orn}
            <div class="pr-text">${this.paras(c.text)}</div>
          </section>`;
      });
      return h;
    },

    print(o) {
      const html = this.build(o);
      if (!html) return App.toast(t('pdf_empty'), 'err');
      document.querySelectorAll('#print-root, #print-page').forEach((x) => x.remove());
      const root = document.createElement('div');
      root.id = 'print-root';
      root.className = `look-${o.look}`;
      root.innerHTML = html;
      document.body.appendChild(root);
      // Размер страницы задаём отдельным правилом: @page нельзя менять через переменные
      const st = document.createElement('style');
      st.id = 'print-page';
      st.textContent = `@page { size: ${o.size === 'A4' ? 'A4' : 'A5'}; }`;
      document.head.appendChild(st);
      document.documentElement.classList.add('printing', o.look === 'paper' ? 'print-paper' : 'print-site');
      const done = () => {
        root.remove();
        st.remove();
        document.documentElement.classList.remove('printing', 'print-paper', 'print-site');
        window.removeEventListener('afterprint', done);
      };
      window.addEventListener('afterprint', done);
      // Даём браузеру дорисовать шрифты, потом открываем печать
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => window.print(), 60));
    },

    async open() {
      const o = this.o;
      const body = App.el(`<div>
        <p>${t('pdf_intro')}</p>
        <div class="lbl">${t('pdf_look')}</div>
        <label class="radio"><input type="radio" name="look" value="site"><span>${t('pdf_look_site')}<br><small>${t('pdf_look_site_hint')}</small></span></label>
        <label class="radio"><input type="radio" name="look" value="paper"><span>${t('pdf_look_paper')}<br><small>${t('pdf_look_paper_hint')}</small></span></label>
        <div class="set-row"><span>${t('pdf_size')}</span><select class="inp" name="size"><option value="A5">${t('pdf_a5')}</option><option value="A4">A4</option></select></div>
        <div class="set-row"><span>${t('pdf_which')}</span><select class="inp" name="which"><option value="all">${t('pdf_all')}</option><option value="done">${t('pdf_done')}</option></select></div>
        <div class="set-row"><span>${t('pdf_author')}</span><input class="inp" name="author" placeholder="${t('pdf_author_ph')}"></div>
        <p style="color:var(--text-dim);font-size:12.5px;margin:12px 0 0">${t('pdf_hint')}</p>
      </div>`);
      body.querySelector(`[name=look][value=${o.look}]`).checked = true;
      body.querySelector('[name=size]').value = o.size;
      body.querySelector('[name=which]').value = o.which;
      body.querySelector('[name=author]').value = o.author;
      const res = await App.modal({
        title: t('m_pdf'),
        body,
        buttons: [
          { label: t('cancel'), value: null },
          {
            label: t('pdf_go'),
            primary: true,
            value: (mb) => ({
              look: mb.querySelector('[name=look]:checked').value,
              size: mb.querySelector('[name=size]').value,
              which: mb.querySelector('[name=which]').value,
              author: mb.querySelector('[name=author]').value,
            }),
          },
        ],
      });
      if (!res) return;
      this.o = res;
      App.lsSet('chernilnitsa.pdf', JSON.stringify(res));
      this.print(res);
    },

    init() {
      try {
        Object.assign(this.o, JSON.parse(App.lsGet('chernilnitsa.pdf') || '{}'));
      } catch (e) {}
    },
  };
})();
