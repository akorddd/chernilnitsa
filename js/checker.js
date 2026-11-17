'use strict';
/* =========================================================
   Проверка текста: LanguageTool (онлайн) и анализ стиля (локально)
   ========================================================= */
(function () {
  const App = window.App;

  /* ---------- LanguageTool ---------- */
  App.Checker = {
    API: 'https://api.languagetool.org/v2/check',
    // Лимиты бесплатного API: 20 запросов и 75 КБ в минуту, до 20 КБ за запрос
    LIMIT_BYTES: 75000,
    LIMIT_REQ: 20,
    CHUNK_BYTES: 18000,
    log: [],
    enc: new TextEncoder(),

    bytes(s) {
      return this.enc.encode(s).length;
    },

    usage() {
      const now = Date.now();
      this.log = this.log.filter((x) => now - x.t < 60000);
      return {
        bytes: this.log.reduce((a, x) => a + x.b, 0),
        reqs: this.log.length,
        wait: this.log.length ? Math.ceil((60000 - (now - this.log[0].t)) / 1000) : 0,
      };
    },

    // Расширяем выделение до границ предложений, чтобы проверка видела контекст
    expand(text, s, e) {
      const END = /[.!?…\n]/;
      let a = s,
        b = e;
      while (a > 0 && !END.test(text[a - 1]) && s - a < 1500) a--;
      while (a < b && /\s/.test(text[a])) a++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      while (b < text.length && !END.test(text[b - 1] || '') && b - e < 1500) b++;
      while (b < text.length && /[.!?…»"')\]]/.test(text[b])) b++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      return [a, b];
    },

    chunks(str) {
      if (this.bytes(str) <= this.CHUNK_BYTES) return [{ o: 0, s: str }];
      const out = [];
      let start = 0;
      while (start < str.length) {
        let end = Math.min(str.length, start + 8000);
        if (end < str.length) {
          const cut = Math.max(str.lastIndexOf('\n', end), str.lastIndexOf('. ', end) + 1);
          if (cut > start + 1000) end = cut;
        }
        out.push({ o: start, s: str.slice(start, end) });
        start = end;
      }
      return out;
    },

    fail(msg) {
      const e = new Error(msg);
      e.userMsg = msg;
      return e;
    },

    async check(snippet, base, chId, field) {
      const parts = this.chunks(snippet);
      const total = this.bytes(snippet);
      const u = this.usage();
      if (u.bytes + total > this.LIMIT_BYTES || u.reqs + parts.length > this.LIMIT_REQ) {
        throw this.fail(App.t('lt_limit', { s: u.wait || 60 }));
      }
      const lang = App.data.settings.checkLang || 'ru-RU';
      const out = [];
      for (const p of parts) {
        const body = new URLSearchParams({ text: p.s, language: lang });
        if (lang === 'auto') body.set('preferredVariants', 'en-US');
        let res;
        try {
          res = await fetch(this.API, { method: 'POST', body, headers: { Accept: 'application/json' } });
        } catch (e) {
          throw this.fail(App.t('lt_network'));
        }
        this.log.push({ t: Date.now(), b: this.bytes(p.s) });
        App.emit('limit');
        if (res.status === 429) throw this.fail(App.t('lt_limit', { s: 60 }));
        if (!res.ok) throw this.fail(App.t('lt_error') + ' (' + res.status + ')');
        const json = await res.json();
        for (const m of json.matches || []) {
          const is = this.map(m, base + p.o, chId, field, p.s);
          if (is) out.push(is);
        }
      }
      return out;
    },

    map(m, off, chId, field, str) {
      const text = str.substr(m.offset, m.length);
      const rule = m.rule || {};
      const cat = (rule.category && rule.category.id) || '';
      let type;
      if (rule.issueType === 'misspelling' || cat === 'TYPOS') type = 'spell';
      else if (['style', 'register', 'locale-violation'].includes(rule.issueType) || ['STYLE', 'REDUNDANCY', 'COLLOQUIALISMS'].includes(cat)) type = 'style';
      else type = 'grammar';
      if (type === 'spell' && App.data.dictionary.includes(text.toLowerCase())) return null;
      const repl = (m.replacements || []).slice(0, 6).map((r) => r.value);
      // Нет вариантов — сайт не понял, что имелось в виду, и переспрашивает
      if (!repl.length && type !== 'style') type = 'question';
      return {
        id: App.uid(),
        ch: chId,
        field,
        offset: off + m.offset,
        length: m.length,
        text,
        type,
        source: 'lt',
        rule: rule.id || '',
        message: m.message || m.shortMessage || '',
        repl,
      };
    },
  };

  /* ---------- Анализ стиля (без интернета, лимит не тратит) ---------- */
  App.Style = {
    FILL: {
      ru: ['очень', 'просто', 'как бы', 'вообще', 'буквально', 'действительно', 'типа', 'собственно', 'практически',
        'абсолютно', 'совершенно', 'довольно', 'вполне', 'определённо', 'в принципе', 'на самом деле', 'так сказать',
        'в общем', 'являться', 'является', 'являлся', 'осуществлять', 'данный', 'данная', 'данное'],
      en: ['very', 'really', 'just', 'actually', 'basically', 'literally', 'quite', 'somewhat', 'totally',
        'kind of', 'sort of', 'pretty much', 'definitely', 'simply'],
    },
    STOP: new Set(('было были была быть будет этого этому этим этом этой этих только тоже также когда если чтобы потому ' +
      'меня мной себя себе свой своей своих свою своим который которая которые которых которой котором которого ' +
      'может могут могла могли можно даже всего всех всеми ещё уже нему ними после перед через между вместе ' +
      'вокруг почему всегда никогда снова сейчас теперь потом тогда здесь где-то какой какая какие какого ' +
      'этот такой такая такие такого очень просто вообще ' +
      'that this with have from they were been what when there their would could which your into than then ' +
      'them just like some about these those other where while being').split(/\s+/)),

    analyze(text, s, e, chId, field) {
      const part = text.slice(s, e);
      const L = /[а-яё]/i.test(part) ? 'ru' : 'en';
      const out = [];
      const mk = (o, l, type, message, rule) =>
        out.push({ id: App.uid(), ch: chId, field, offset: s + o, length: l, text: part.substr(o, l), type, source: 'style', rule, message, repl: [] });
      let m;

      // 1. Повторы слов рядом (сравниваем начало слова, чтобы ловить разные формы)
      const words = [];
      const re = /[\p{L}][\p{L}\-’']*/gu;
      while ((m = re.exec(part))) words.push({ w: m[0], o: m.index, k: m[0].toLowerCase().replace(/ё/g, 'е') });
      const WIN = 20;
      for (let i = 0; i < words.length; i++) {
        const a = words[i];
        if (a.k.length < 5 || this.STOP.has(a.k)) continue;
        const st = a.k.slice(0, 5);
        for (let j = i - 1; j >= Math.max(0, i - WIN); j--) {
          const b = words[j];
          if (b.k.length >= 5 && b.k.slice(0, 5) === st && !this.STOP.has(b.k)) {
            mk(a.o, a.w.length, 'style', App.t('st_repeat', { w: b.w, n: i - j }), 'REPEAT');
            break;
          }
        }
      }

      // 2. Слова-паразиты и канцелярит
      for (const f of this.FILL[L]) {
        const r = new RegExp(`(?<![\\p{L}])${App.escRe(f)}(?![\\p{L}])`, 'giu');
        while ((m = r.exec(part))) mk(m.index, m[0].length, 'style', App.t('st_filler', { w: m[0] }), 'FILLER');
      }

      // 3. Слишком длинные предложения (подчёркиваем первые слова)
      const sre = /[^.!?…\n]+(?:[.!?…]+|$)/g;
      while ((m = sre.exec(part))) {
        const n = App.words(m[0]);
        if (n > 35) {
          const lead = m[0].length - m[0].trimStart().length;
          const head = m[0].slice(lead).match(/^(?:\S+\s+){0,2}\S+/);
          mk(m.index + lead, head ? head[0].length : 10, 'style', App.t('st_long', { n }), 'LONG');
        }
      }

      // 4. Пометки автора вроде [?] или [вспомнил?]
      const qre = /\[[^\]\n]{0,120}\?[^\]\n]{0,120}\]/g;
      while ((m = qre.exec(part))) mk(m.index, m[0].length, 'question', App.t('st_marker'), 'MARKER');

      return out;
    },
  };
})();
