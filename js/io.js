'use strict';
/* =========================================================
   Импорт/экспорт (.md в формате Obsidian), резервная копия, демо
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const esc = App.esc;

  App.IO = {
    pick(accept) {
      return new Promise((res) => {
        const i = document.createElement('input');
        i.type = 'file';
        i.accept = accept;
        i.onchange = () => res(i.files[0] || null);
        i.click();
      });
    },

    /* Разбор Markdown: свойства (---), заголовок «#», главы «##».
       Понимает и свой экспорт: тезисы в блоке «> [!abstract]», статус в комментарии. */
    parseMd(raw) {
      raw = raw.replace(/\r\n?/g, '\n');
      let fm = '',
        body = raw;
      const fmm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
      if (fmm) {
        fm = fmm[1];
        body = raw.slice(fmm[0].length);
      }
      const parts = body.split(/^##[ \t]+(.*)$/m);
      const tm = parts[0].match(/^#[ \t]+(.+)$/m);
      const chapters = [];
      for (let i = 1; i < parts.length; i += 2) {
        let content = parts[i + 1] || '';
        const ch = { title: parts[i].trim(), thesis: '', structured: false };
        const meta = content.match(/<!--\s*chernilnitsa:\s*(\{[^\n]*?\})\s*-->/);
        if (meta) {
          try {
            const o = JSON.parse(meta[1]);
            ch.status = o.status;
            ch.color = o.color;
          } catch (e) {}
          content = content.replace(meta[0], '');
          ch.structured = true;
        }
        const cm = content.match(/^> ?\[!abstract\][+-]?[^\n]*\n((?:>[^\n]*(?:\n|$))*)/m);
        if (cm) {
          ch.thesis = cm[1]
            .split('\n')
            .map((l) => l.replace(/^> ?/, ''))
            .join('\n')
            .trim();
          content = content.replace(cm[0], '');
          ch.structured = true;
        }
        ch.body = content.trim();
        chapters.push(ch);
      }
      return {
        frontmatter: fm,
        title: tm ? tm[1].trim() : '',
        chapters,
        structured: chapters.length > 0 && chapters.every((c) => c.structured),
      };
    },

    buildMd() {
      const b = App.data.book;
      const fm = b.frontmatter || `tags: [книга]\nдата: ${App.today()}`;
      let out = `---\n${fm}\n---\n# ${b.title || t('untitled_book')}\n\n`;
      b.chapters.forEach((c, i) => {
        out += `## ${c.title || i + 1}\n<!-- chernilnitsa: ${JSON.stringify({ status: c.status, color: c.color })} -->\n`;
        if (c.thesis.trim()) out += `> [!abstract]- ${t('thesis')}\n` + c.thesis.trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
        out += c.text.trim() ? c.text.trim() + '\n\n' : '\n';
      });
      return out;
    },

    async importMd() {
      const f = await this.pick('.md,.markdown,.txt');
      if (!f) return;
      const parsed = this.parseMd(await f.text());
      if (!parsed.chapters.length) return App.toast(t('import_none'), 'err');
      const body = App.el(`<div>
        <p>${t('import_found', { n: parsed.chapters.length, name: esc(f.name) })}</p>
        ${
          parsed.structured
            ? `<p style="color:var(--text-dim)">${t('import_structured')}</p>`
            : `<div class="lbl">${t('import_where')}</div>
          <label class="radio"><input type="radio" name="tg" value="thesis" checked><span><b>${t('thesis')}</b><br><small>${t('import_thesis_hint')}</small></span></label>
          <label class="radio"><input type="radio" name="tg" value="text"><span><b>${t('text')}</b><br><small>${t('import_text_hint')}</small></span></label>`
        }
        <div class="lbl">${t('import_mode')}</div>
        <label class="radio"><input type="radio" name="md" value="append" checked><span>${t('import_append')}</span></label>
        <label class="radio"><input type="radio" name="md" value="replace"><span>${t('import_replace')}</span></label>
      </div>`);
      const res = await App.modal({
        title: t('import_title'),
        body,
        buttons: [
          { label: t('cancel'), value: null },
          {
            label: t('import_go'),
            primary: true,
            value: (mb) => ({
              tg: (mb.querySelector('[name=tg]:checked') || {}).value || 'thesis',
              md: mb.querySelector('[name=md]:checked').value,
            }),
          },
        ],
      });
      if (!res) return;
      const d = App.data;
      if (res.md === 'replace' && !(await App.confirm(t('import_replace_q'), t('import_replace_ok'), true))) return;

      const onlyEmpty = d.book.chapters.length === 1 && !d.book.chapters[0].text.trim() && !d.book.chapters[0].thesis.trim();
      const replace = res.md === 'replace' || onlyEmpty;
      const startIdx = replace ? 0 : d.book.chapters.length;
      const chs = parsed.chapters.map((p, i) => {
        const c = App.newChapter(p.title, startIdx + i);
        if (p.structured) {
          c.thesis = p.thesis;
          c.text = p.body;
          if (App.STATUSES.includes(p.status)) c.status = p.status;
          if (p.color) c.color = p.color;
        } else {
          c[res.tg] = p.body;
          c.status = res.tg === 'thesis' ? 'thesis' : 'draft';
        }
        return c;
      });
      if (replace) {
        d.book.chapters = chs;
        d.issues = [];
      } else d.book.chapters.push(...chs);
      if (parsed.title && (replace || !d.book.title)) d.book.title = parsed.title;
      if (parsed.frontmatter && (replace || !d.book.frontmatter)) d.book.frontmatter = parsed.frontmatter;
      d.settings.active = chs[0].id;
      App.saveNow();
      App.emit('data-reset');
      App.toast(t('imported', { n: chs.length }), 'ok');
    },

    async exportMd() {
      App.saveNow();
      if (await App.download(`${App.safeName(App.data.book.title || t('untitled_book'))}.md`, this.buildMd(), 'text/markdown;charset=utf-8')) App.toast(t('exported'), 'ok');
    },

    async backup() {
      App.saveNow();
      const name = `${App.safeName(App.data.book.title || t('untitled_book'))} — ${t('backup_word')} ${App.today()}.json`;
      if (await App.download(name, JSON.stringify({ app: 'chernilnitsa', v: 1, exported: new Date().toISOString(), data: App.data }, null, 1), 'application/json')) App.toast(t('backup_done'), 'ok');
    },

    async restore() {
      const f = await this.pick('.json');
      if (!f) return;
      let j;
      try {
        j = JSON.parse(await f.text());
      } catch (e) {
        j = null;
      }
      if (!j || j.app !== 'chernilnitsa' || !j.data) return App.toast(t('restore_bad'), 'err');
      if (!(await App.confirm(t('restore_q'), t('restore_ok'), true))) return;
      App.data = App.normalize(j.data);
      App.saveNow();
      App.emit('data-reset');
      App.toast(t('restored'), 'ok');
    },
  };

  /* ---------- Демо-книга для презентации (с нарочными ошибками) ---------- */
  App.demoData = () => {
    const ch1 = App.newChapter('Письмо', 0);
    ch1.status = 'draft';
    ch1.color = '#4dabf7';
    ch1.thesis =
      'Смотритель маяка Аркадий живёт один на острове. Шторм. Утром приходит письмо от внучки, которую он не видел десять лет.';
    ch1.text =
      'Маяк стоял на краю скалы уже больше ста лет. Каждый вечер старый смотритель Аркадий поднимался по винтовой лестнице и зажигал агонь, хотя корабли здесь давно не ходили. Он знал что это бессмысленно, но остановится не мог.\n\n' +
      'В тот вечер ветер был особенно сильным. Волны бились о скалы так, что брызги долетали до самого окна. Аркадий налил себе чаю и сел у окна, глядя на тёмное море, которое казалось ему очень очень живым.\n\n' +
      'Письмо пришло утром. Почерк на конверте был незнакомый, но обратный адрес он узнал сразу — это была улица, на которой когда то жила его дочь.';
    const ch2 = App.newChapter('Дорога', 1);
    ch2.color = '#ffa94d';
    ch2.thesis =
      'Аркадий впервые за много лет покидает остров. Паромщица Лиза узнаёт его. [что она знает о его дочери?]\nРазговор на пароме о том, как изменился город.';
    const ch3 = App.newChapter('Город', 2);
    ch3.color = '#69db7c';
    ch3.thesis = 'Город изменился до неузнаваемости. Аркадий ищет дом дочери и находит там только внучку.';

    const d = App.blank();
    d.book.title = 'Свет маяка (демо)';
    d.book.chapters = [ch1, ch2, ch3];
    d.settings.active = ch1.id;
    d.characters = [
      { id: App.uid(), name: 'Аркадий', role: 'Смотритель маяка, главный герой', age: '68', looks: 'Высокий, сутулый, седая борода, всегда в старом бушлате.', traits: 'Упрямый, молчаливый, верит в ритуалы.', bio: 'Сорок лет на маяке. Поссорился с дочерью после смерти жены.', color: '#4dabf7' },
      { id: App.uid(), name: 'Лиза', role: 'Паромщица', age: '27', looks: 'Короткие рыжие волосы, обветренное лицо.', traits: 'Прямолинейная, смешливая.', bio: '', color: '#ffa94d' },
    ];
    d.places = [
      { id: App.uid(), name: 'Маяк', kind: 'Остров, здание', desc: 'Белая каменная башня на северном мысу. 124 ступени.', notes: '', color: '#ffd43b' },
      { id: App.uid(), name: 'Город', kind: 'Портовый город на материке', desc: 'Сюда двадцать лет назад уехала дочь Аркадия.', notes: '', color: '#69db7c' },
    ];
    d.timeline = [
      { id: App.uid(), when: '40 лет назад', title: 'Аркадий становится смотрителем', desc: '', chapter: '' },
      { id: App.uid(), when: '10 лет назад', title: 'Ссора с дочерью', desc: 'После похорон жены.', chapter: '' },
      { id: App.uid(), when: 'Наши дни', title: 'Письмо от внучки', desc: '', chapter: ch1.id },
    ];
    d.notes = [
      { id: App.uid(), title: 'Идеи для финала', body: '— Аркадий возвращается на маяк вместе с внучкой?\n— Маяк выключают навсегда, и это освобождение.', color: '#9775fa' },
      { id: App.uid(), title: 'Звук моря', body: 'Записать, как звучат волны в шторм: глухо, как удары в дверь.', color: '#38d9a9' },
    ];
    return d;
  };
})();
