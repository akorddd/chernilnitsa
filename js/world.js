'use strict';
/* =========================================================
   «Мир книги» — живой мир, который сайт строит по тексту книги.
   1) ЧТЕНИЕ: ищем в книге географию и места — море, горы, лес,
      реки, города, замки, стены, маяки, стороны света, время суток —
      и запоминаем фразы, из которых это взялось.
   2) МИР: большой ландшафт до горизонта (2,4 × 2,4 км подробно,
      дальше — горы и море до края неба): реки с водопадом, озёра,
      поля, дороги, города с улицами, замки, стены, леса, животные.
   3) КАРТИНКА: WebGL без библиотек — мягкий свет, тени от гор,
      небо с облаками, вода с отражениями, туман, время суток;
      вечером в окнах и на улицах зажигаются фонари.
   4) КАДРЫ, как в загрузочных экранах: полёт над миром (мышью
      можно править), вечерняя улица, водопад в лесу, замок,
      побережье, долина. Кадры сменяются сами.
   Экономия: фон рисуем в уменьшенном разрешении, 24 кадра в секунду
   (6 — пока вы печатаете), ничего не рисуем во вкладке в фоне,
   пересобираем мир, только когда текст изменился.
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => {
    const k = clamp((x - a) / (b - a), 0, 1);
    return k * k * (3 - 2 * k);
  };

  /* ---------- Случайность «по зерну»: один текст = один мир ---------- */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let q = a;
      q = Math.imul(q ^ (q >>> 15), q | 1);
      q ^= q + Math.imul(q ^ (q >>> 7), q | 61);
      return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeNoise(seed) {
    const r = rng(seed);
    const perm = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const val = new Float32Array(256);
    for (let i = 0; i < 256; i++) val[i] = r();
    const n2 = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const X = xi & 255, Y = yi & 255;
      const a = val[p[p[X] + Y]], b = val[p[p[X + 1] + Y]], c = val[p[p[X] + Y + 1]], d = val[p[p[X + 1] + Y + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y, o) => {
      let s = 0, amp = 0.5, f = 1, nn = 0;
      for (let i = 0; i < (o || 5); i++) {
        s += n2(x * f, y * f) * amp;
        nn += amp;
        amp *= 0.5;
        f *= 2.03;
      }
      return s / nn;
    };
    const ridge = (x, y, o) => {
      let s = 0, amp = 0.5, f = 1, nn = 0, w = 1;
      for (let i = 0; i < (o || 4); i++) {
        const v = 1 - Math.abs(n2(x * f, y * f) * 2 - 1);
        s += v * v * amp * w;
        w = clamp(v * 1.4, 0.3, 1);
        nn += amp;
        amp *= 0.5;
        f *= 2.1;
      }
      return s / nn;
    };
    return { n2, fbm, ridge };
  }

  /* =========================================================
     1. ЧТЕНИЕ КНИГИ
     ========================================================= */
  // Слово, которое НАЧИНАЕТСЯ с одной из основ (ё заменяем на е заранее)
  const W = (s) => new RegExp('(?<![\\p{L}])(?:' + s + ')', 'giu');
  const END = '(?![\\p{L}])';
  const FEATS = {
    sea: W('мор(?:е|я|ю|ем|ей|ск)|океан|залив|бухт|пролив|прибо|волн|шторм|побереж|берег|ocean|sea' + END + '|bay' + END + '|coast|shore|wave'),
    island: W('остров|архипелаг|атолл|island|archipelago'),
    mountain: W('гор(?:а|ы|у|ой|ам|ами|ах)' + END + '|горн(?:ый|ая|ое|ые|ого|ых|ым)|хребт|хребет|скал|утес|вершин|mountain|peak|ridge|cliff'),
    volcano: W('вулкан|лав(?:а|ы|ой)' + END + '|volcano|lava'),
    hills: W('холм|сопк|пригор|hill'),
    forest: W('лес(?:а|у|ом|е|ов|ам|ами|ах)?' + END + '|лесн|рощ|чащ|тайг|джунгл|бор(?:а|у|ом)?' + END + '|forest|wood' + END + '|woods|grove|jungle'),
    desert: W('пустын|песк|песок|песч|дюн|бархан|desert|dune|sand'),
    snow: W('снег|снеж|лед' + END + '|льд|ледник|мороз|зим[аыуео]|тундр|айсберг|snow|ice' + END + '|glacier|frost|winter|tundra'),
    river: W('рек(?:а|и|у|ой|е|ам|ами|ах)' + END + '|речк|речн|ручей|ручь|river|stream'),
    waterfall: W('водопад|waterfall'),
    lake: W('озер|пруд|lake|pond'),
    swamp: W('болот|топь|топи|трясин|swamp|marsh|bog'),
    plain: W('равнин|степ|луг|пол(?:е|я|ей|ям)' + END + '|долин|пашн|нив(?:а|ы|у)' + END + '|ферм|пшениц|plain|steppe|meadow|field|valley|farm|wheat'),
    city: W('город|столиц|порт(?:а|у|ом|е)?' + END + '|city|town|capital|harbou?r'),
    village: W('деревн|посел|хутор|village|hamlet'),
    lighthouse: W('маяк|lighthouse'),
    castle: W('замок|замк|крепост|цитадел|castle|fortress|citadel'),
    wall: W('стен(?:а|ы|у|ой|е)' + END + '|wall' + END),
    tower: W('башн|tower'),
    house: W('дом(?:а|е|у|ом|ик|ой)?' + END + '|хижин|изб[аеуы]|house|cabin|hut' + END),
    bridge: W('мост' + END + '|моста|мосту|мостом|bridge'),
    road: W('дорог|тропа|тропинк|road|path'),
    temple: W('храм|церк|собор|монастыр|temple|church|cathedral|monastery'),
    ship: W('корабл|лодк|паром|судн|ship|boat|ferry'),
    animals: W('олен|косул|овц|овеч|коров|лошад|стад|deer|sheep|cow|horse|herd'),
    birds: W('птиц|чайк|ворон|орел|орл|ласточ|bird|gull|crow|eagle'),
    continent: W('материк|континент|continent'),
  };
  const DIRS = [
    [W('север|north'), 0, -1],
    [W('юг|южн|south'), 0, 1],
    [W('восток|восточн|east'), 1, 0],
    [W('запад|west'), -1, 0],
    [W('в центре|посередин|в середине|center|centre|middle'), 0, 0],
  ];
  const MAPW = {
    continent: W('материк|континент|continent'),
    realm: W('королевств|импери|княжеств|царств|kingdom|empire|realm'),
    map: W('карт(?:а|у|е|ы|ой)' + END + '|map' + END),
    globe: W('экватор|полюс|полушари|equator|hemisphere'),
  };
  const SIZE = /(\d[\d\s]{0,6})\s*(км|километр|миль|верст|лиг|km|kilomet|mile|league)/giu;
  const NUMW = {
    один: 1, одна: 1, одно: 1, два: 2, две: 2, двух: 2, двумя: 2, три: 3, трех: 3, тремя: 3, четыре: 4, четырех: 4, пять: 5, пяти: 5,
    шесть: 6, шести: 6, семь: 7, семи: 7, восемь: 8, восьми: 8, девять: 9, девяти: 9, десять: 10, десяти: 10,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const COUNT = new RegExp('(?<![\\p{L}])(\\d+|' + Object.keys(NUMW).join('|') + ')\\s+(?:[\\p{L}-]+\\s+)?(материк|континент|остров|continent|island)', 'giu');
  const TIME = {
    night: W('ноч|луна|лунн|звезд|полноч|темнот|night|moon|stars'),
    dusk: W('закат|вечер|сумер|рассвет|sunset|dusk|evening|dawn'),
    storm: W('шторм|бур(?:я|и|ю|е)' + END + '|гроз|ливень|туман|дожд|storm|rain|fog'),
  };
  const NAME = /(?<![\p{L}])(город[\p{L}]*|городк[\p{L}]*|остров[\p{L}]*|рек[аиуе]|гор[аыу]|мор[еяю]|озер[\p{L}]*|королевств[\p{L}]*|деревн[\p{L}]*|порт[\p{L}]*|крепост[\p{L}]*|замок|замк[\p{L}]*|маяк[\p{L}]*|материк[\p{L}]*|континент[\p{L}]*|лес[\p{L}]*|пустын[\p{L}]*|city|island|river|mount|lake|kingdom|sea|town|castle)\s+«?([А-ЯЕA-Z][\p{L}’'-]{1,20})/gu;
  const NAME_TYPE = [
    [/^(город|порт|city|town)/i, 'city'], [/^(остров|island)/i, 'island'], [/^(рек|river)/i, 'river'], [/^(гор|mount)/i, 'mountain'],
    [/^(мор|sea)/i, 'sea'], [/^(озер|lake)/i, 'lake'], [/^(королевств|kingdom)/i, 'realm'], [/^(деревн)/i, 'village'],
    [/^(крепост|замок|замк|castle)/i, 'castle'], [/^(материк|континент)/i, 'continent'], [/^(лес)/i, 'forest'], [/^(пустын)/i, 'desert'], [/^(маяк)/i, 'lighthouse'],
  ];
  const PLACE_TYPES = ['castle', 'city', 'village', 'lighthouse', 'tower', 'temple', 'wall', 'lake', 'waterfall', 'mountain', 'forest', 'bridge', 'house'];
  const short = (s) => {
    s = s.replace(/\s+/g, ' ').trim();
    return s.length > 150 ? s.slice(0, 147).replace(/\s+\S*$/, '') + '…' : s;
  };
  // «Кракову», «Кракове» → «Краков»: общее начало у разных падежей
  function lemmaNames(raw) {
    const groups = new Map();
    for (const n of raw) {
      const k = n.name.slice(0, 4).toLowerCase() + '|' + n.type;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    const out = [];
    for (const g of groups.values()) {
      const forms = [...new Set(g.map((x) => x.name))];
      let name = forms[0];
      if (forms.length > 1) {
        let p = forms[0];
        for (const f of forms) while (!f.startsWith(p)) p = p.slice(0, -1);
        if (p.length >= 4) name = p;
      } else if (g[0].type === 'city' && name.length > 5 && /[бвгджзклмнпрстфхцчшщ][уеюи]$/i.test(name)) {
        name = name.slice(0, -1); // «в Кракове» → «Краков»
      }
      const withDir = g.find((x) => x.dir) || g[0];
      out.push({ name, type: g[0].type, dir: withDir.dir, quote: withDir.quote, n: g.length });
    }
    return out.slice(0, 24);
  }

  function analyze(raw, places) {
    const text = raw.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
    const cnt = {}, dir = {}, dl = {}, quotes = {}, rawNames = [];
    const sentences = text.split(/(?<=[.!?…])\s+|\n+/);
    const dirOf = (s) => {
      let dx = 0, dy = 0, any = false;
      for (const [re, x, y] of DIRS) {
        re.lastIndex = 0;
        if (re.test(s)) {
          dx += x;
          dy += y;
          any = true;
        }
      }
      const len = Math.hypot(dx, dy) || 1;
      return any ? { x: dx / len, y: dy / len } : null;
    };
    for (const s of sentences) {
      if (s.length < 3) continue;
      const d = dirOf(s);
      // «к востоку ОТ гор — пустыня»: горы здесь ориентир, а не то, что на востоке
      const noRef = d ? s.replace(/(?<![\p{L}])от\s+[\p{L}-]+/giu, ' ') : s;
      for (const k in FEATS) {
        const re = FEATS[k];
        re.lastIndex = 0;
        const m = s.match(re);
        if (!m) continue;
        cnt[k] = (cnt[k] || 0) + m.length;
        const q = quotes[k] || (quotes[k] = []);
        re.lastIndex = 0;
        if (d && re.test(noRef)) {
          const dd = dir[k] || (dir[k] = { x: 0, y: 0, n: 0 });
          dd.x += d.x;
          dd.y += d.y;
          dd.n++;
          // Каждое упоминание отдельно: «на севере материк… на юге материк» = два места
          (dl[k] || (dl[k] = [])).push({ x: d.x, y: d.y, quote: short(s) });
          if (q.length < 3 && !q.includes(short(s))) q.unshift(short(s));
        } else if (q.length < 2) q.push(short(s));
      }
      // Названия: «материк Сайрон», «Река Мейра» (тип с заглавной делаем строчным)
      const ns = s.replace(/(?<![\p{L}])([А-ЯA-Z])(?=[\p{Ll}]+\s+«?[А-ЯA-Z])/gu, (m) => m.toLowerCase());
      for (const m of ns.matchAll(NAME)) {
        const tt = NAME_TYPE.find(([re]) => re.test(m[1]));
        if (tt) rawNames.push({ name: m[2], type: tt[1], dir: d, quote: short(s) });
      }
    }
    for (const k in dir) {
      dir[k].x /= dir[k].n;
      dir[k].y /= dir[k].n;
    }
    // Места из вкладки «Мир» — самые точные: имя, тип и сторона света из описания
    const placeNames = [];
    for (const p of places || []) {
      if (!p.name || !p.name.trim()) continue;
      const all = [p.name, p.kind, p.desc, p.notes].filter(Boolean).join('. ').replace(/ё/g, 'е');
      const head = ((p.kind || '') + ' ' + p.name).replace(/ё/g, 'е');
      let type = null;
      for (const k of PLACE_TYPES) if (((FEATS[k].lastIndex = 0), FEATS[k].test(head))) { type = k; break; }
      if (!type) for (const k of PLACE_TYPES) if (((FEATS[k].lastIndex = 0), FEATS[k].test(all))) { type = k; break; }
      if (!type) continue;
      placeNames.push({ name: p.name.trim(), type, dir: dirOf(all), quote: short(p.desc || p.kind || p.name), place: true, n: 9 });
      cnt[type] = (cnt[type] || 0) + 1;
    }
    const names = placeNames.concat(lemmaNames(rawNames).filter((n) => !placeNames.some((p) => p.name === n.name)));
    const mm = {};
    for (const k in MAPW) {
      MAPW[k].lastIndex = 0;
      mm[k] = (text.match(MAPW[k]) || []).length;
    }
    const sizes = [...text.matchAll(SIZE)].map((m) => parseInt(m[1].replace(/\s/g, ''), 10)).filter((n) => n > 0 && n < 1e6);
    const counts = {};
    for (const m of text.matchAll(COUNT)) {
      const w = m[1].toLowerCase();
      const n = isNaN(+w) ? NUMW[w] : +w;
      const k = /матер|конт|contin/i.test(m[2]) ? 'continent' : 'island';
      if (n && n < 40) counts[k] = Math.max(counts[k] || 0, n);
    }
    const tm = {};
    for (const k in TIME) {
      TIME[k].lastIndex = 0;
      tm[k] = (text.match(TIME[k]) || []).length;
    }
    let time = 'day';
    const best = Object.keys(tm).sort((a, b) => tm[b] - tm[a])[0];
    if (tm[best] >= 2) time = best;
    const maxKm = sizes.length ? Math.max(...sizes) : 0;
    return { cnt, dir, dl, quotes, mm, counts, maxKm, time, tm, names, seed: hashStr(text) };
  }

  /* =========================================================
     2. МИР: рельеф, вода, места, дороги, леса, животные
     ========================================================= */
  const R = 1200; // половина подробной области, м
  const N = 240; // клеток сетки
  const CELL = (2 * R) / N; // 10 м
  const FAR = 12000; // до горизонта
  const FCELL = 400;
  const TEX = 1024; // карта полей и дорог
  const VB = 5; // кубик подробной земли, м
  const VN = (2 * R) / VB; // 480 × 480 столбиков
  const FB = 80, FVH = 20; // кубики дальних гор: 80 м в ширину, ступень 20 м
  const FVN = (2 * FAR) / FB;
  const HT = 256; // высоты и тени для шейдеров

  const lin = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.pow(v / 255, 2.2) * (k || 1);
    return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
  };
  const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const C = {
    grass: lin('#3f8226'), grass2: lin('#6f9234'), meadow: lin('#559a30'), forest: lin('#355f24'), sand: lin('#d9c690'),
    wet: lin('#a59874'), rock: lin('#7d766b'), rock2: lin('#5d5852'), snow: lin('#eef2f6'), desert: lin('#d8b47a'),
    swamp: lin('#4c5a33'), dirt: lin('#7e6448'), seabed: lin('#8c7b5c'),
  };
  function norm3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const distSeg = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const k = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
    return [Math.hypot(px - ax - dx * k, pz - az - dz * k), k];
  };

  /* ---------- Геометрия: треугольники с нормалью, цветом и «свечением» ---------- */
  class Geo {
    constructor() {
      this.a = [];
    }
    v(p, n, c, e) {
      this.a.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], e || 0);
    }
    tri(p0, p1, p2, c, e, n) {
      n = n || norm3(cross(sub3(p1, p0), sub3(p2, p0)));
      this.v(p0, n, c, e);
      this.v(p1, n, c, e);
      this.v(p2, n, c, e);
    }
    // Четырёхугольник; цвет низа (p0, p1) можно затемнить — мягкая тень у земли
    quad(p0, p1, p2, p3, c, e, n, cb) {
      n = n || norm3(cross(sub3(p1, p0), sub3(p3, p0)));
      const c2 = cb || c;
      this.v(p0, n, c2, e);
      this.v(p1, n, c2, e);
      this.v(p2, n, c, e);
      this.v(p0, n, c2, e);
      this.v(p2, n, c, e);
      this.v(p3, n, c, e);
    }
  }
  // Локальная система: центр, поворот вокруг вертикали
  const frame = (cx, cy, cz, yaw) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return {
      p: (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c],
      n: (x, y, z) => [x * c - z * s, y, x * s + z * c],
    };
  };
  // Коробка без дна. ao — насколько темнее низ стен
  function box(g, F, x0, y0, z0, x1, y1, z1, col, top, ao) {
    const cb = mulc(col, ao == null ? 0.7 : ao);
    const P = F.p, Nn = F.n;
    g.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), col, 0, Nn(0, 0, 1), cb);
    g.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), col, 0, Nn(0, 0, -1), cb);
    g.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), col, 0, Nn(1, 0, 0), cb);
    g.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), col, 0, Nn(-1, 0, 0), cb);
    g.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), top || col, 0, Nn(0, 1, 0));
  }
  function cyl(g, F, r0, r1, y0, y1, seg, col, ao, cap) {
    const cb = mulc(col, ao == null ? 0.75 : ao);
    const k = (r0 - r1) / (y1 - y0);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n0 = F.n(...norm3([c0, k, s0])), n1 = F.n(...norm3([c1, k, s1]));
      const A = F.p(c0 * r0, y0, s0 * r0), B = F.p(c1 * r0, y0, s1 * r0), Cc = F.p(c1 * r1, y1, s1 * r1), D = F.p(c0 * r1, y1, s0 * r1);
      g.v(A, n0, cb); g.v(B, n1, cb); g.v(Cc, n1, col);
      g.v(A, n0, cb); g.v(Cc, n1, col); g.v(D, n0, col);
      if (cap) g.tri(F.p(0, y1, 0), D, Cc, cap, 0, F.n(0, 1, 0));
    }
  }
  function cone(g, F, r, y0, y1, seg, col, base) {
    const h = y1 - y0;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const nn = (a) => F.n(...norm3([Math.cos(a) * h, r, Math.sin(a) * h]));
      const A = F.p(Math.cos(a0) * r, y0, Math.sin(a0) * r), B = F.p(Math.cos(a1) * r, y0, Math.sin(a1) * r), T = F.p(0, y1, 0);
      g.v(A, nn(a0), col); g.v(B, nn(a1), col); g.v(T, nn(am), mulc(col, 1.15));
      if (base) g.tri(F.p(0, y0, 0), B, A, base, 0, F.n(0, -1, 0));
    }
  }
  // Сфера из октаэдра; мягкие нормали — «пушистая» крона
  function blob(g, F, cx, cy, cz, r, sy, col, rnd) {
    let tris = [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
      [[0, 0, 1], [0, -1, 0], [1, 0, 0]], [[-1, 0, 0], [0, -1, 0], [0, 0, 1]], [[0, 0, -1], [0, -1, 0], [-1, 0, 0]], [[1, 0, 0], [0, -1, 0], [0, 0, -1]],
    ];
    const nt = [];
    for (const [a, b, c] of tris) {
      const ab = norm3([a[0] + b[0], a[1] + b[1], a[2] + b[2]]), bc = norm3([b[0] + c[0], b[1] + c[1], b[2] + c[2]]), ca = norm3([c[0] + a[0], c[1] + a[1], c[2] + a[2]]);
      nt.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    tris = nt;
    const jit = new Map();
    const J = (v) => {
      const k = v.map((x) => x.toFixed(3)).join();
      if (!jit.has(k)) jit.set(k, 0.86 + rnd() * 0.28);
      return jit.get(k);
    };
    for (const tri of tris)
      for (const v of tri) {
        const j = J(v);
        const p = F.p(cx + v[0] * r * j, cy + v[1] * r * sy * j, cz + v[2] * r * j);
        const sh = 0.62 + 0.38 * (v[1] * 0.5 + 0.5);
        g.v(p, F.n(v[0], v[1] / sy, v[2]), mulc(col, sh * (0.9 + (j - 0.86) * 0.7)));
      }
  }

  /* ---------- Модели для «размножения»: деревья, животные, лодки ---------- */
  function protoMeshes() {
    const r = rng(77);
    const F = frame(0, 0, 0, 0);
    const M = {};
    const trunk = lin('#5a3c24');
    const G = (v) => [v, v, v];
    let g = new Geo();
    // ель: ярусы-коробки сужаются кверху
    box(g, F, -0.45, 0, -0.45, 0.45, 3, 0.45, trunk, null, 0.7);
    [[3.0, 2.0, 0.62], [2.4, 4.4, 0.7], [1.8, 6.8, 0.78], [1.2, 9.2, 0.86], [0.6, 11.4, 0.95]].forEach(([r, y, v]) => box(g, F, -r, y, -r, r, y + 2.4, r, G(v), G(v + 0.12), 0.72));
    M.conifer = g;
    g = new Geo();
    // лиственное: ствол и ступенчатая крона
    box(g, F, -0.5, 0, -0.5, 0.5, 4.2, 0.5, trunk, null, 0.7);
    box(g, F, -3, 3.6, -3, 3, 6.8, 3, G(0.72), G(0.9), 0.7);
    box(g, F, -2, 6.8, -2, 2, 8.6, 2, G(0.8), G(0.95), 0.8);
    box(g, F, 2.6, 4.4, -1.4, 3.8, 6.2, 1.2, G(0.7), G(0.86), 0.75);
    box(g, F, -1.2, 4.2, -3.8, 1.4, 6, -2.6, G(0.7), G(0.86), 0.75);
    box(g, F, -3.6, 5, 0.4, -2.6, 6.6, 2.2, G(0.74), G(0.88), 0.75);
    M.broad = g;
    g = new Geo();
    // тополь: высокая узкая крона
    box(g, F, -0.35, 0, -0.35, 0.35, 2.4, 0.35, trunk, null, 0.7);
    box(g, F, -1.4, 2, -1.4, 1.4, 8.4, 1.4, G(0.72), G(0.9), 0.7);
    box(g, F, -0.8, 8.4, -0.8, 0.8, 10, 0.8, G(0.82), G(0.95), 0.85);
    M.poplar = g;
    // облако из кубиков
    g = new Geo();
    const W2 = G(0.95), Wt = G(1.0);
    [[-30, 0, -20, 30, 14, 20], [-18, 10, -14, 22, 24, 12], [-46, 2, -10, -24, 12, 12], [24, 3, -8, 44, 13, 14], [-8, 20, -8, 12, 30, 8], [-20, 4, 16, 8, 12, 28]].forEach((c) => box(g, F, c[0], c[1], c[2], c[3], c[4], c[5], W2, Wt, 0.82));
    M.cloud = g;
    const legs = (g, w, d, h, col) => {
      for (const [x, z] of [[w, d], [w, -d], [-w, d], [-w, -d]]) box(g, F, x - 0.06, 0, z - 0.06, x + 0.06, h, z + 0.06, col, null, 1);
    };
    g = new Geo();
    legs(g, 0.38, 0.2, 0.42, lin('#2c2622'));
    box(g, F, -0.55, 0.35, -0.33, 0.55, 0.95, 0.33, lin('#ece6d6'), lin('#f4efe2'), 0.85);
    box(g, F, 0.5, 0.6, -0.15, 0.85, 0.92, 0.15, lin('#2c2622'), null, 1);
    M.sheep = g;
    g = new Geo();
    legs(g, 0.7, 0.3, 0.75, lin('#3a2a20'));
    box(g, F, -1.0, 0.7, -0.45, 1.0, 1.55, 0.45, lin('#7a5236'), null, 0.85);
    box(g, F, -0.3, 0.72, -0.46, 0.4, 1.4, 0.46, lin('#efe8dc'), null, 0.85);
    box(g, F, 0.95, 1.05, -0.24, 1.45, 1.5, 0.24, lin('#6a4630'), null, 1);
    M.cow = g;
    g = new Geo();
    legs(g, 0.5, 0.15, 0.9, lin('#4a3424'));
    box(g, F, -0.7, 0.85, -0.22, 0.7, 1.35, 0.22, lin('#9a6638'), null, 0.85);
    box(g, F, 0.5, 1.2, -0.12, 0.75, 1.85, 0.12, lin('#93613a'), null, 1);
    box(g, F, 0.6, 1.75, -0.12, 1.05, 1.98, 0.12, lin('#8a5a35'), null, 1);
    box(g, F, -0.75, 1.15, -0.08, -0.65, 1.32, 0.08, lin('#eeeeee'), null, 1);
    box(g, F, 0.6, 1.95, -0.2, 0.66, 2.35, -0.16, lin('#6b5a44'), null, 1);
    box(g, F, 0.6, 1.95, 0.16, 0.66, 2.35, 0.2, lin('#6b5a44'), null, 1);
    M.deer = g;
    g = new Geo();
    const hull = lin('#6a4a30'), deck = lin('#9c7c58');
    const hp = [[-5, 0.6, -1.5], [3, 0.6, -1.6], [5.6, 0.9, 0], [3, 0.6, 1.6], [-5, 0.6, 1.5]];
    const hb = [[-4.4, -0.8, -0.9], [2.6, -0.8, -1], [4.6, -0.4, 0], [2.6, -0.8, 1], [-4.4, -0.8, 0.9]];
    for (let i = 0; i < 5; i++) {
      const j = (i + 1) % 5;
      g.quad(F.p(...hb[i]), F.p(...hb[j]), F.p(...hp[j]), F.p(...hp[i]), hull, 0, null, mulc(hull, 0.6));
    }
    g.tri(F.p(...hp[0]), F.p(...hp[1]), F.p(...hp[4]), deck, 0, [0, 1, 0]);
    g.tri(F.p(...hp[1]), F.p(...hp[3]), F.p(...hp[4]), deck, 0, [0, 1, 0]);
    g.tri(F.p(...hp[1]), F.p(...hp[2]), F.p(...hp[3]), deck, 0, [0, 1, 0]);
    cyl(g, F, 0.14, 0.1, 0.6, 10, 5, lin('#4a3626'), 1);
    const sail = lin('#efe6d2');
    g.tri(F.p(0.2, 2, 0), F.p(-3.8, 2.3, 0), F.p(0.2, 9.4, 0), sail, 0, [0, 0, 1]);
    g.tri(F.p(0.2, 2, 0), F.p(0.2, 9.4, 0), F.p(-3.8, 2.3, 0), sail, 0, [0, 0, -1]);
    g.tri(F.p(0.4, 2.2, 0), F.p(0.4, 8.6, 0), F.p(4.6, 1.6, 0), sail, 0, [0, 0, 1]);
    g.tri(F.p(0.4, 2.2, 0), F.p(4.6, 1.6, 0), F.p(0.4, 8.6, 0), sail, 0, [0, 0, -1]);
    M.ship = g;
    return M;
  }

  /* ---------- Сам мир ---------- */
  function buildWorld(f) {
    const T0 = performance.now();
    const noise = makeNoise(f.seed);
    const rnd = rng(f.seed ^ 0x9e3779b9);
    const cnt = f.cnt, dl = f.dl;
    const has = (k) => (cnt[k] || 0) > 0;
    const dirs = (k) => (dl[k] || []).filter((d) => Math.hypot(d.x, d.y) > 0.3);
    const randDir = () => {
      const a = rnd() * Math.PI * 2;
      return { x: Math.cos(a), y: Math.sin(a) };
    };

    /* ----- Разметка мира: где море, горы, леса ----- */
    const L = { sea: [], mts: [], forests: [], deserts: [], swamps: [], islands: [] };
    const coastal = has('sea') || has('lighthouse') || has('ship') || has('island');
    const islandMode = has('island') && !has('continent') && (cnt.island || 0) * 2 >= (cnt.sea || 0);
    if (coastal && !islandMode) {
      const ds = dirs('sea');
      if (ds.length) ds.slice(0, 2).forEach((d) => L.sea.push({ x: d.x, y: d.y }));
      else if (f.dir.sea && Math.hypot(f.dir.sea.x, f.dir.sea.y) > 0.3) L.sea.push({ x: f.dir.sea.x, y: f.dir.sea.y });
      else L.sea.push(randDir());
      L.sea.forEach((d) => {
        const l = Math.hypot(d.x, d.y) || 1;
        d.x /= l;
        d.y /= l;
      });
    }
    // Дальние острова на горизонте
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2, rr = 1.7 + rnd() * 3.5;
      L.islands.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: 0.15 + rnd() * 0.3 });
    }
    const mtCount = has('mountain') || has('snow') || has('volcano') ? 1 + Math.min(2, Math.floor((cnt.mountain || 0) / 6)) : 0;
    dirs('mountain').slice(0, 3).forEach((d) => L.mts.push({ x: d.x * 0.72, y: d.y * 0.72 }));
    while (L.mts.length < mtCount) {
      let d = randDir();
      // горы — подальше от моря
      if (L.sea.length) d = { x: -L.sea[0].x * 0.8 + d.x * 0.5, y: -L.sea[0].y * 0.8 + d.y * 0.5 };
      const l = Math.hypot(d.x, d.y) || 1;
      L.mts.push({ x: (d.x / l) * (0.62 + rnd() * 0.2), y: (d.y / l) * (0.62 + rnd() * 0.2) });
    }
    L.mts.forEach((m) => Object.assign(m, { r: 0.42 + rnd() * 0.18, amp: has('snow') ? 560 : 500, sx: rnd() * 50, sy: rnd() * 50 }));
    if (has('volcano')) {
      const d = dirs('volcano')[0] || randDir();
      L.volcano = { x: d.x * 0.6, y: d.y * 0.6, r: 0.32 };
    }
    const fCount = has('forest') ? 2 + Math.min(3, Math.floor(cnt.forest / 3)) : 1;
    dirs('forest').slice(0, 3).forEach((d) => L.forests.push({ x: d.x * 0.55, y: d.y * 0.55, r: 0.4, k: 1 }));
    while (L.forests.length < fCount) {
      const a = rnd() * Math.PI * 2, rr = 0.25 + rnd() * 0.6;
      L.forests.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: 0.25 + rnd() * 0.25, k: has('forest') ? 1 : 0.55 });
    }
    if (has('desert')) {
      const d = dirs('desert')[0] || randDir();
      L.deserts.push({ x: d.x * 0.6, y: d.y * 0.6, r: 0.5 });
    }
    if (has('swamp')) {
      const d = dirs('swamp')[0] || randDir();
      L.swamps.push({ x: d.x * 0.5, y: d.y * 0.5, r: 0.28 });
    }
    const hillAmp = 16 + (has('hills') ? 22 : 0) + (has('mountain') ? 8 : 0) - (has('plain') ? 8 : 0);
    const snowLine = has('snow') ? (cnt.snow >= 4 ? 120 : 190) : 300;
    const winter = (cnt.snow || 0) >= 6 ? 1 : 0;
    const blobK = (u, v, b) => {
      const dx = u - b.x, dy = v - b.y;
      return Math.exp(-(dx * dx + dy * dy) / (b.r * b.r));
    };

    // Высота «как задумала природа» — в любой точке до горизонта
    function landE(u, v) {
      let e = 0.42;
      for (const sd of L.sea) e -= sstep(0.05, 0.95, u * sd.x + v * sd.y) * 1.15;
      if (islandMode) e = 0.45 - sstep(0.5, 1.05, Math.hypot(u * 0.95, v * 1.05)) * 1.1;
      if (coastal) for (const b of L.islands) e = Math.max(e, 0.32 - (Math.hypot(u - b.x, v - b.y) / b.r) * 0.4);
      e += (noise.fbm(u * 0.85 + 3.1, v * 0.85 + 7.7, 5) - 0.5) * 0.8;
      return e;
    }
    function H0(x, z) {
      const u = x / R, v = z / R;
      const e = landE(u, v);
      const land = sstep(-0.05, 0.25, e);
      let h = e > 0 ? e * 55 : e * 160;
      h += (noise.fbm(u * 3.2 + 11, v * 3.2 + 5, 5) - 0.45) * hillAmp * 2 * land;
      h += (noise.fbm(u * 10 + 2, v * 10 + 9, 3) - 0.5) * 5 * land;
      const mk = sstep(-0.35, 0.05, e);
      for (const m of L.mts) {
        const k = blobK(u, v, m);
        if (k > 0.004) h += Math.pow(noise.ridge(u * 2.6 + m.sx, v * 2.6 + m.sy, 5) * 0.85 + 0.2, 1.25) * m.amp * k * mk;
      }
      if (L.volcano) {
        const d = Math.hypot(u - L.volcano.x, v - L.volcano.y) / L.volcano.r;
        if (d < 1) h += (Math.pow(1 - d, 1.6) * 330 - sstep(0.12, 0.0, d) * 60) * mk;
      }
      for (const b of L.deserts) h += Math.sin(u * 60 + noise.n2(u * 6, v * 6) * 4) * 2.5 * blobK(u, v, b) * land;
      for (const b of L.swamps) h = lerp(h, Math.min(h, 3 + noise.fbm(u * 20, v * 20, 2) * 3), blobK(u, v, b) * land);
      // Хребты на горизонте, чтобы мир не обрывался
      const rr = Math.hypot(u, v);
      if (rr > 1.1 && !islandMode) h += sstep(1.25, 2.6, rr) * Math.pow(noise.ridge(u * 0.85 + 40, v * 0.85 + 9, 4) * 0.95 + 0.1, 1.45) * 820 * mk;
      return h;
    }
    const forestK = (u, v) => {
      let d = 0.04;
      for (const b of L.forests) d = Math.max(d, blobK(u, v, b) * b.k);
      for (const m of L.mts) d = Math.max(d, blobK(u, v, { x: m.x, y: m.y, r: m.r * 1.5 }) * 0.6);
      d *= 0.4 + 1.3 * sstep(0.38, 0.66, noise.fbm(u * 4.5 + 20, v * 4.5 + 3, 4));
      if (Math.hypot(u, v) > 1.05) d = Math.max(d, sstep(0.45, 0.62, noise.fbm(u * 2 + 5, v * 2 + 1, 3)) * 0.8);
      return clamp(d, 0, 1);
    };

    /* ----- Подробная сетка ----- */
    const NV = N + 1;
    const hg = new Float32Array(NV * NV);
    const gx = (i) => -R + i * CELL;
    for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) hg[j * NV + i] = H0(gx(i), gx(j));
    const inside = (x, z) => x > -R && x < R && z > -R && z < R;
    // После «нарезки на кубики» земля — это верх блока
    let vox = null;
    function ground(x, z) {
      if (vox) {
        const i = Math.floor((x + R) / VB), j = Math.floor((z + R) / VB);
        if (i >= 0 && j >= 0 && i < VN && j < VN) return vox[j * VN + i] * VB + 0.6;
      }
      return gS(x, z);
    }
    function gS(x, z) {
      if (!inside(x, z)) return H0(x, z);
      const fx = (x + R) / CELL, fz = (z + R) / CELL;
      const i = Math.min(N - 1, Math.floor(fx)), j = Math.min(N - 1, Math.floor(fz));
      const a = fx - i, b = fz - j;
      const h00 = hg[j * NV + i], h10 = hg[j * NV + i + 1], h01 = hg[(j + 1) * NV + i], h11 = hg[(j + 1) * NV + i + 1];
      return lerp(lerp(h00, h10, a), lerp(h01, h11, a), b);
    }
    const slopeAt = (x, z, r) => {
      r = r || 8;
      const dx = ground(x + r, z) - ground(x - r, z), dz = ground(x, z + r) - ground(x, z - r);
      return Math.hypot(dx, dz) / (2 * r);
    };
    // Изменить сетку в круге: fn(h, x, z, d) → новая высота
    const modify = (cx, cz, rad, fn) => {
      const i0 = Math.max(0, Math.floor((cx - rad + R) / CELL)), i1 = Math.min(N, Math.ceil((cx + rad + R) / CELL));
      const j0 = Math.max(0, Math.floor((cz - rad + R) / CELL)), j1 = Math.min(N, Math.ceil((cz + rad + R) / CELL));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const x = gx(i), z = gx(j), d = Math.hypot(x - cx, z - cz);
          if (d <= rad) hg[j * NV + i] = fn(hg[j * NV + i], x, z, d);
        }
    };

    /* ----- Река и водопад ----- */
    const rivers = [];
    let fall = null;
    const wantRiver = has('river') || has('waterfall') || has('forest') || L.mts.length || has('hills');
    if (wantRiver) {
      // Исток — высокое место у гор или холмов
      let src = null, best = -1e9;
      for (let k = 0; k < 220; k++) {
        const m = L.mts.length ? L.mts[k % L.mts.length] : null;
        const u = m ? m.x + (rnd() - 0.5) * m.r * 1.6 : (rnd() - 0.5) * 1.5, v = m ? m.y + (rnd() - 0.5) * m.r * 1.6 : (rnd() - 0.5) * 1.5;
        if (Math.abs(u) > 0.85 || Math.abs(v) > 0.85) continue;
        const h = ground(u * R, v * R);
        const sc = Math.min(h, 230) - Math.hypot(u, v) * 40 + rnd() * 20;
        if (h > 25 && sc > best) {
          best = sc;
          src = { x: u * R, z: v * R };
        }
      }
      if (src) {
        // Куда течь: к морю или прочь от гор, за край мира
        let tgt;
        if (L.sea.length) tgt = { x: L.sea[0].x * R * 1.1, z: L.sea[0].y * R * 1.1 };
        else {
          const a = Math.atan2(src.z, src.x) + Math.PI + (rnd() - 0.5) * 1.2;
          tgt = { x: Math.cos(a) * R * 1.05, z: Math.sin(a) * R * 1.05 };
        }
        const pts = [];
        let x = src.x, z = src.z, hd = Math.atan2(tgt.z - z, tgt.x - x);
        for (let s = 0; s < 260; s++) {
          pts.push({ x, z });
          if (Math.abs(x) > R - 15 || Math.abs(z) > R - 15) break;
          if (ground(x, z) < -0.5 && s > 3) break;
          // смотрим веером вперёд: ниже и ближе к цели
          let bd = hd, bs = 1e9;
          const toT = Math.atan2(tgt.z - z, tgt.x - x);
          for (let a = -1.1; a <= 1.1; a += 0.275) {
            const ang = hd + a, nx = x + Math.cos(ang) * 12, nz = z + Math.sin(ang) * 12;
            let da = ang - toT;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            const sc = ground(nx, nz) + Math.abs(da) * 9 + Math.abs(a) * 3 + noise.n2(nx * 0.01, nz * 0.01) * 6;
            if (sc < bs) {
              bs = sc;
              bd = ang;
            }
          }
          hd = bd;
          x += Math.cos(hd) * 12;
          z += Math.sin(hd) * 12;
        }
        if (pts.length > 25) {
          // Водопад — уступ поперёк реки примерно на трети пути
          const k = Math.floor(pts.length * (0.3 + rnd() * 0.12));
          const P = pts[k], Q = pts[k + 1];
          const fd = norm3([Q.x - P.x, Q.z - P.z, 0]);
          const STEP = 26;
          const stepAdd = (x, z) => {
            const s = (x - P.x) * fd[0] + (z - P.z) * fd[1];
            return STEP * sstep(3, -5, s) * sstep(320, 150, Math.hypot(x - P.x, z - P.z));
          };
          modify(P.x, P.z, 330, (h, x, z) => h + stepAdd(x, z));
          // Уровень воды вдоль реки только убывает
          const wl = [];
          let cur = 1e9;
          for (const p of pts) {
            cur = Math.min(cur, ground(p.x, p.z) - 1.4);
            wl.push(Math.max(cur, 0.05));
          }
          const wid = pts.map((p, i) => 5 + (i / pts.length) * 9);
          rivers.push({ pts, wl, wid });
          const kb = Math.min(pts.length - 1, k + 2);
          fall = { x: P.x + fd[0], z: P.z + fd[1], dx: fd[0], dz: fd[1], top: wl[k - 1], bot: wl[kb], w: wid[k] * 1.5, k };
          // Русло
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1], w = wid[i];
            const rad = w * 3 + 14;
            modify((a.x + b.x) / 2, (a.z + b.z) / 2, rad + 8, (h, x, z) => {
              const [d, kk] = distSeg(x, z, a.x, a.z, b.x, b.z);
              const lv = lerp(wl[i], wl[i + 1], kk);
              const bed = lv - 2.4 * (1 - Math.min(1, (d / w) * (d / w))) - 0.3;
              if (d < w) return Math.min(h, bed);
              return Math.min(h, lerp(lv + 0.2, h, sstep(w, w * 3, d)));
            });
          }
          // Чаша под водопадом
          const pc = { x: P.x + fd[0] * 16, z: P.z + fd[1] * 16 };
          modify(pc.x, pc.z, 40, (h, x, z, d) => Math.min(h, lerp(fall.bot - 3.5, h, sstep(18, 40, d))));
          fall.pool = pc;
        }
      }
    }
    // Расстояние до реки по сетке (для деревьев, полей, дорог)
    const rD = new Float32Array(NV * NV).fill(1e4);
    for (const rv of rivers)
      for (let i = 0; i < rv.pts.length - 1; i++) {
        const a = rv.pts[i], b = rv.pts[i + 1];
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - 60 + R) / CELL)), i1 = Math.min(N, Math.ceil((Math.max(a.x, b.x) + 60 + R) / CELL));
        const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - 60 + R) / CELL)), j1 = Math.min(N, Math.ceil((Math.max(a.z, b.z) + 60 + R) / CELL));
        for (let j = j0; j <= j1; j++)
          for (let ii = i0; ii <= i1; ii++) {
            const [d] = distSeg(gx(ii), gx(j), a.x, a.z, b.x, b.z);
            const q = j * NV + ii;
            if (d - rv.wid[i] < rD[q]) rD[q] = d - rv.wid[i];
          }
      }
    const riverDist = (x, z) => (inside(x, z) ? rD[Math.round((z + R) / CELL) * NV + Math.round((x + R) / CELL)] : 1e4);

    /* ----- Места: города, деревни, замки… ----- */
    const S = [];
    const lakes = [];
    const named = f.names.slice();
    const takeName = (type) => {
      const i = named.findIndex((n) => n.type === type);
      return i >= 0 ? named.splice(i, 1)[0] : null;
    };
    function findSpot(pref, rad, opt) {
      opt = opt || {};
      let best = null, bs = -1e9;
      for (let k = 0; k < 90; k++) {
        let u, v;
        if (pref) {
          u = pref.x + (rnd() - 0.5) * 0.4;
          v = pref.y + (rnd() - 0.5) * 0.4;
        } else {
          const a = rnd() * Math.PI * 2, rr = 0.1 + rnd() * 0.68;
          u = Math.cos(a) * rr;
          v = Math.sin(a) * rr;
        }
        const lim = 1 - (rad + 60) / R;
        u = clamp(u, -lim, lim);
        v = clamp(v, -lim, lim);
        const x = u * R, z = v * R, h = ground(x, z);
        if (h < (opt.minH == null ? 4 : opt.minH) || h > (opt.maxH || 260)) continue;
        let rough = 0;
        for (let a = 0; a < 8; a++) rough = Math.max(rough, Math.abs(ground(x + Math.cos(a) * rad * 0.8, z + Math.sin(a) * rad * 0.8) - h));
        let sc = -rough * (opt.flatW || 2) + rnd() * 6;
        if (pref) sc -= Math.hypot(u - pref.x, v - pref.y) * 160;
        if (opt.high) sc += h * 0.5;
        if (opt.coast) {
          let wet = 0;
          for (let a = 0; a < 12; a++) if (ground(x + Math.cos(a * 0.52) * (rad + 30), z + Math.sin(a * 0.52) * (rad + 30)) < 0) wet++;
          sc += wet ? 60 : -400;
        }
        if (riverDist(x, z) < rad * 0.7) sc -= 300;
        for (const s of S) if (Math.hypot(s.x - x, s.z - z) < s.r + rad + 50) sc -= 1000;
        for (const l of lakes) if (Math.hypot(l.x - x, l.z - z) < l.r + rad + 30) sc -= 1000;
        if (fall && Math.hypot(fall.x - x, fall.z - z) < rad + 140) sc -= 500;
        if (sc > bs) {
          bs = sc;
          best = { x, z, h };
        }
      }
      return best;
    }
    const add = (type, pref, rad, opt, nm) => {
      // если в нужной стороне только вода — ищем ближе к середине, потом где угодно
      let p = null;
      for (const k of pref ? [1, 0.75, 0.5, 0.3] : [1]) if (!p) p = findSpot(pref && { x: pref.x * k, y: pref.y * k }, rad, opt);
      if (!p && pref) p = findSpot(null, rad, opt);
      if (!p) return null;
      const s = { type, x: p.x, z: p.z, r: rad, h: Math.max(p.h, (opt && opt.minH) || 4), name: nm && nm.name, quote: nm && nm.quote };
      S.push(s);
      return s;
    };
    // у названного места — своя сторона света; чужую (из других фраз) не занимаем
    const prefOf = (nm, k, i) => (nm ? nm.dir || null : dirs(k)[i] || null);
    const scaleDir = (d) => {
      if (!d) return null;
      const l = Math.hypot(d.x, d.y);
      return l > 0.3 ? { x: (d.x / l) * 0.62, y: (d.y / l) * 0.62 } : { x: 0, y: 0 };
    };

    // Замки — на возвышенностях
    const nCastle = has('castle') ? clamp(Math.max(dirs('castle').length, 1 + Math.floor(cnt.castle / 8)), 1, 3) : 0;
    for (let i = 0; i < nCastle; i++) {
      const nm = takeName('castle');
      add('castle', scaleDir(prefOf(nm, 'castle', i)), 55, { high: true, flatW: 1 }, nm || { quote: (dirs('castle')[i] || {}).quote || (f.quotes.castle || [])[0] });
    }
    // Города
    const cityNames = f.names.filter((n) => n.type === 'city').length;
    const nCity = has('city') || has('house') || has('road') || has('temple') ? clamp(Math.max(cityNames, 1 + Math.floor((cnt.city || 0) / 12)), 1, 3) : 0;
    for (let i = 0; i < nCity; i++) {
      const nm = takeName('city');
      add('city', scaleDir(prefOf(nm, 'city', i)) || (i === 0 && !L.sea.length ? { x: 0, y: 0 } : null), i === 0 ? 190 : 120, { coast: i === 0 && L.sea.length > 0, minH: 3 }, nm || { quote: (f.quotes.city || [])[i] });
    }
    // Деревни
    const nVil = has('village') ? clamp(1 + Math.floor(cnt.village / 2), 1, 4) : nCity ? 2 : 1;
    for (let i = 0; i < nVil; i++) add('village', scaleDir(prefOf(takeName('village'), 'village', i)), 70, { minH: 3 }, { quote: (f.quotes.village || [])[i] });
    // Маяк — на берегу
    if (has('lighthouse') || (coastal && L.sea.length && (has('ship') || cnt.sea >= 3))) {
      const nm = takeName('lighthouse');
      add('lighthouse', scaleDir(prefOf(nm, 'lighthouse', 0)) || (L.sea[0] && { x: L.sea[0].x * 0.6, y: L.sea[0].y * 0.6 }), 14, { coast: true, minH: 2 }, nm || { quote: (f.quotes.lighthouse || [])[0] });
    }
    if (has('tower')) add('tower', scaleDir(prefOf(null, 'tower', 0)), 14, { high: true, flatW: 1 }, { quote: (f.quotes.tower || [])[0] });
    if (has('temple') && !nCity) add('temple', scaleDir(prefOf(null, 'temple', 0)), 30, { high: true }, { quote: (f.quotes.temple || [])[0] });
    // Озёра
    const nLake = has('lake') ? clamp(1 + Math.floor(cnt.lake / 4), 1, 3) : L.sea.length ? 0 : 1;
    for (let i = 0; i < nLake; i++) {
      const nm = takeName('lake');
      const p = findSpot(scaleDir(prefOf(nm, 'lake', i)), 110, { minH: 6, maxH: 160 });
      if (!p) continue;
      const r = 70 + rnd() * 70;
      const lv = p.h - 1;
      lakes.push({ x: p.x, z: p.z, r, L: lv, name: nm && nm.name });
      modify(p.x, p.z, r * 1.6, (h, x, z, d) => {
        const wob = r * (0.85 + 0.25 * noise.n2(x * 0.02 + i * 7, z * 0.02));
        if (d < wob) return Math.min(h, lv - 5 * (1 - (d / wob) * (d / wob)) - 0.5);
        return Math.max(Math.min(h, lerp(lv + 0.6, h, sstep(wob, wob * 1.6, d))), lv + 0.4);
      });
    }
    for (const b of L.swamps)
      for (let i = 0; i < 6; i++) {
        const a = rnd() * 6.28, rr = rnd() * b.r * 0.7;
        const x = (b.x + Math.cos(a) * rr) * R, z = (b.y + Math.sin(a) * rr) * R;
        if (!inside(x, z) || ground(x, z) < 1) continue;
        const lv = ground(x, z) - 0.6, r = 14 + rnd() * 22;
        lakes.push({ x, z, r, L: lv, swamp: true });
        modify(x, z, r * 1.4, (h, xx, zz, d) => (d < r ? Math.min(h, lv - 1.5 * (1 - d / r) - 0.2) : Math.max(Math.min(h, lerp(lv + 0.3, h, sstep(r, r * 1.4, d))), lv + 0.2)));
      }

    // Выровнять площадки под постройки
    for (const s of S) {
      const base = Math.max(s.h, 3.5);
      if (s.type === 'castle') {
        s.h = base + 6;
        modify(s.x, s.z, s.r * 2.6, (h, x, z, d) => {
          const top = s.h + noise.n2(x * 0.05, z * 0.05) * 0.4;
          if (d < s.r * 1.05) return top;
          return Math.max(h, lerp(top, h, sstep(s.r * 1.05, s.r * 2.6, d)));
        });
      } else {
        s.h = base;
        modify(s.x, s.z, s.r * 1.5, (h, x, z, d) => lerp(s.h + noise.n2(x * 0.03, z * 0.03) * (s.type === 'city' ? 0.8 : 1.5), h, sstep(s.r * 0.95, s.r * 1.5, d)));
      }
    }

    /* ----- Дороги: поиск пути по склонам (Дейкстра на сетке 20 м) ----- */
    const map = new Uint8Array(TEX * TEX * 4); // R поле, G культура, B дорога, A мостовая
    const RG = 120, RC = (2 * R) / RG;
    const roads = [];
    const bridges = [];
    function path(a, b) {
      const idx = (x, z) => clamp(Math.round((z + R) / RC), 0, RG) * (RG + 1) + clamp(Math.round((x + R) / RC), 0, RG);
      const n = (RG + 1) * (RG + 1);
      const dist = new Float32Array(n).fill(1e9), prev = new Int32Array(n).fill(-1), hh = new Float32Array(n), rv = new Float32Array(n);
      for (let j = 0; j <= RG; j++)
        for (let i = 0; i <= RG; i++) {
          const x = -R + i * RC, z = -R + j * RC;
          hh[j * (RG + 1) + i] = ground(x, z);
          rv[j * (RG + 1) + i] = riverDist(x, z);
        }
      const s = idx(a.x, a.z), e = idx(b.x, b.z);
      const heap = [];
      const push = (k, d) => {
        heap.push([d, k]);
        let i = heap.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heap[p][0] <= heap[i][0]) break;
          [heap[p], heap[i]] = [heap[i], heap[p]];
          i = p;
        }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]];
            i = m;
          }
        }
        return top;
      };
      dist[s] = 0;
      push(s, 0);
      const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      while (heap.length) {
        const [d, k] = pop();
        if (k === e) break;
        if (d > dist[k]) continue;
        const i = k % (RG + 1), j = (k - i) / (RG + 1);
        for (const [di, dj] of NB) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni > RG || nj > RG) continue;
          const nk = nj * (RG + 1) + ni;
          const len = Math.hypot(di, dj) * RC;
          const dh = Math.abs(hh[nk] - hh[k]) / len;
          let c = len * (1 + dh * dh * 220 + (hh[nk] < 1 ? 5000 : 0));
          if (rv[nk] < 6) c += 180;
          if (dist[k] + c < dist[nk]) {
            dist[nk] = dist[k] + c;
            prev[nk] = k;
            push(nk, dist[nk]);
          }
        }
      }
      if (prev[e] < 0 && e !== s) return null;
      let pts = [];
      for (let k = e; k >= 0; k = prev[k]) {
        const i = k % (RG + 1), j = (k - i) / (RG + 1);
        pts.push({ x: -R + i * RC, z: -R + j * RC });
        if (k === s) break;
      }
      pts.reverse();
      pts[0] = { x: a.x, z: a.z };
      pts[pts.length - 1] = { x: b.x, z: b.z };
      // сглаживаем изломы
      for (let it = 0; it < 3; it++) {
        const np = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i], q = pts[i + 1];
          np.push({ x: p.x * 0.75 + q.x * 0.25, z: p.z * 0.75 + q.z * 0.25 }, { x: p.x * 0.25 + q.x * 0.75, z: p.z * 0.25 + q.z * 0.75 });
        }
        np.push(pts[pts.length - 1]);
        pts = np;
      }
      return pts;
    }
    if (S.length > 1) {
      // минимальное остовное дерево: все места связаны
      const inT = [S[0]], out = S.slice(1);
      while (out.length) {
        let bi = 0, bj = 0, bd = 1e12;
        out.forEach((o, i) =>
          inT.forEach((q, j) => {
            const d = Math.hypot(o.x - q.x, o.z - q.z);
            if (d < bd) {
              bd = d;
              bi = i;
              bj = j;
            }
          })
        );
        const o = out.splice(bi, 1)[0];
        const p = path(inT[bj], o);
        if (p) roads.push({ pts: p, w: o.type === 'city' || inT[bj].type === 'city' ? 4.2 : 3 });
        inT.push(o);
      }
    }
    // Главный город — дорога за горизонт
    const capital = S.find((s) => s.type === 'city') || S.find((s) => s.type === 'village');
    if (capital) {
      let best = null, bs = 1e9;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, x = Math.cos(a) * (R - 20), z = Math.sin(a) * (R - 20);
        const h = ground(x, z);
        if (h < 2) continue;
        const sc = Math.hypot(x - capital.x, z - capital.z) * 0.3 + h;
        if (sc < bs) {
          bs = sc;
          best = { x, z };
        }
      }
      if (best) {
        const p = path(capital, best);
        if (p) roads.push({ pts: p, w: 4.2 });
      }
    }
    // Мосты — где дорога пересекает реку
    for (const rd of roads) {
      let inR = -1;
      for (let i = 0; i < rd.pts.length; i++) {
        const p = rd.pts[i], wet = riverDist(p.x, p.z) < 3;
        if (wet && inR < 0) inR = i;
        if (!wet && inR >= 0) {
          const a = rd.pts[Math.max(0, inR - 2)], b = rd.pts[Math.min(rd.pts.length - 1, i + 1)];
          bridges.push({ a, b, h: Math.max(ground(a.x, a.z), ground(b.x, b.z)) + 0.6, w: rd.w + 1.2 });
          inR = -1;
        }
      }
    }
    // Рисуем в текстуру: дороги — B, мостовая — A
    const texI = (x) => ((x + R) / (2 * R)) * TEX;
    const paint = (ax, az, bx, bz, w, ch, val) => {
      const x0 = Math.max(0, Math.floor(texI(Math.min(ax, bx) - w - 3))), x1 = Math.min(TEX - 1, Math.ceil(texI(Math.max(ax, bx) + w + 3)));
      const z0 = Math.max(0, Math.floor(texI(Math.min(az, bz) - w - 3))), z1 = Math.min(TEX - 1, Math.ceil(texI(Math.max(az, bz) + w + 3)));
      for (let j = z0; j <= z1; j++)
        for (let i = x0; i <= x1; i++) {
          const x = ((i + 0.5) / TEX) * 2 * R - R, z = ((j + 0.5) / TEX) * 2 * R - R;
          const [d] = distSeg(x, z, ax, az, bx, bz);
          const v = Math.round(sstep(w + 1.6, w - 0.6, d) * (val || 255));
          const q = (j * TEX + i) * 4 + ch;
          if (v > map[q]) map[q] = v;
        }
    };
    for (const rd of roads) {
      for (let i = 0; i < rd.pts.length - 1; i++) paint(rd.pts[i].x, rd.pts[i].z, rd.pts[i + 1].x, rd.pts[i + 1].z, rd.w * 0.5, 2);
      // насыпь: сгладить рельеф вдоль дороги
      for (let i = 0; i < rd.pts.length; i += 2) {
        const p = rd.pts[i], hp = ground(p.x, p.z);
        if (riverDist(p.x, p.z) < 8) continue;
        modify(p.x, p.z, 14, (h, x, z, d) => lerp(Math.max(hp, 0.6), h, sstep(4, 14, d)));
      }
    }

    /* ----- Нарезаем землю на кубики ----- */
    {
      const lev = new Int16Array(VN * VN);
      for (let j = 0; j < VN; j++)
        for (let i = 0; i < VN; i++) {
          const x = -R + (i + 0.5) * VB, z = -R + (j + 0.5) * VB, h = gS(x, z);
          const wet = riverDist(x, z) < 1 || lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.r);
          lev[j * VN + i] = wet ? Math.floor((h - 0.6) / VB) : Math.round((h - 0.6) / VB);
        }
      vox = lev;
    }
    // уровень озёр — чуть ниже кромки из кубиков
    for (const l of lakes) {
      let m = 1e9;
      for (let a = 0; a < 24; a++) for (const k of [1.05, 1.2]) m = Math.min(m, ground(l.x + Math.cos(a * 0.2618) * l.r * k, l.z + Math.sin(a * 0.2618) * l.r * k));
      l.L = Math.min(l.L, m - 0.7);
    }

    /* ----- Постройки ----- */
    const geo = new Geo();
    const sprites = []; // x, y, z, размер, вид, фаза, яркость
    const lightsPts = []; // для световых пятен на земле
    const labels = [];
    const houses = [];
    const streetsShot = [];
    const wallC = [lin('#e9dfcc'), lin('#d8c6a4'), lin('#c9a982'), lin('#e6d3c0'), lin('#bfae96'), lin('#efe7da'), lin('#c49a7a')];
    const roofC = [lin('#8a3b26'), lin('#6d3424'), lin('#3e3c42'), lin('#5a4535'), lin('#9a4a2c'), lin('#4a4e58')];
    const stone = lin('#9a9286'), stoneD = lin('#77706a'), glass = lin('#1b222c'), door = lin('#3a2a1e'), slate = lin('#3c4048');
    const lantern = (x, y, z, ph, size) => {
      sprites.push(x, y, z, size || 1.9, 0, ph == null ? 0.2 + rnd() * 0.5 : ph, 1);
      lightsPts.push(x, z, 1);
    };
    const minGround = (F, hw, hd) =>
      Math.min(...[[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([a, b]) => {
        const p = F.p(a, 0, b);
        return ground(p[0], p[2]);
      }));
    function house(x, z, yaw, w, d, floors, opt) {
      opt = opt || {};
      const g0 = ground(x, z);
      const base = minGround(frame(x, 0, z, yaw), w / 2, d / 2) - 0.4;
      const F = frame(x, base, z, yaw);
      const top = g0 - base + floors * 3.1 + 0.3;
      const wc = opt.wall || wallC[Math.floor(rnd() * wallC.length)], rc = opt.roof || roofC[Math.floor(rnd() * roofC.length)];
      box(geo, F, -w / 2, 0, -d / 2, w / 2, top, d / 2, wc, wc, 0.62);
      // двускатная крыша
      const o = 0.45, rh = d * (0.38 + rnd() * 0.12);
      const e0 = [-w / 2 - o, top, d / 2 + o], e1 = [w / 2 + o, top, d / 2 + o], r0 = [-w / 2 - o, top + rh, 0], r1 = [w / 2 + o, top + rh, 0];
      const b0 = [-w / 2 - o, top, -d / 2 - o], b1 = [w / 2 + o, top, -d / 2 - o];
      const P = F.p;
      geo.quad(P(...e0), P(...e1), P(...r1), P(...r0), rc, 0, F.n(...norm3([0, d / 2, rh])), mulc(rc, 0.8));
      geo.quad(P(...b1), P(...b0), P(...r0), P(...r1), rc, 0, F.n(...norm3([0, d / 2, -rh])), mulc(rc, 0.8));
      const gh = (rh * (d / 2)) / (d / 2 + o);
      geo.tri(P(-w / 2, top, d / 2), P(-w / 2, top + gh, 0), P(-w / 2, top, -d / 2), wc, 0, F.n(-1, 0, 0));
      geo.tri(P(w / 2, top, -d / 2), P(w / 2, top + gh, 0), P(w / 2, top, d / 2), wc, 0, F.n(1, 0, 0));
      if (rnd() < 0.6) {
        const cx = (rnd() - 0.5) * w * 0.6;
        box(geo, F, cx - 0.35, top + rh * 0.4, -d / 4 - 0.35, cx + 0.35, top + rh + 0.9, -d / 4 + 0.35, stoneD, null, 0.8);
      }
      // окна и дверь
      const gy = g0 - base;
      const nw = Math.max(1, Math.floor(w / 2.7));
      for (let fl = 0; fl < floors; fl++)
        for (const side of [1, -1])
          for (let k = 0; k < nw; k++) {
            const wx = -w / 2 + (k + 0.5) * (w / nw), zz = (d / 2 + 0.05) * side;
            if (fl === 0 && side === 1 && k === Math.floor(nw / 2)) {
              geo.quad(P(wx - 0.6, gy, zz), P(wx + 0.6, gy, zz), P(wx + 0.6, gy + 2.2, zz), P(wx - 0.6, gy + 2.2, zz), door, 0, F.n(0, 0, side));
              continue;
            }
            const y0 = gy + fl * 3.1 + 1.1;
            const seed = 0.05 + rnd() * 0.93;
            const a = side === 1 ? [wx - 0.5, wx + 0.5] : [wx + 0.5, wx - 0.5];
            geo.quad(P(a[0], y0, zz), P(a[1], y0, zz), P(a[1], y0 + 1.35, zz), P(a[0], y0 + 1.35, zz), glass, seed, F.n(0, 0, side));
            if (seed < 0.35 && fl === 0) {
              const lp = P(wx, 0, zz * 1.8);
              lightsPts.push(lp[0], lp[2], 0.35);
            }
          }
      houses.push({ x, z, r: Math.max(w, d) * 0.55 });
    }
    function tower(x, z, r, h, roofCol, opt) {
      opt = opt || {};
      const base = minGround(frame(x, 0, z, 0), r, r) - 0.5;
      const F = frame(x, base, z, rnd() * 6);
      const H = ground(x, z) - base + h;
      const col = opt.col || stone;
      cyl(geo, F, r, r * 0.92, 0, H, 10, col, 0.6);
      if (opt.flat) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          box(geo, frame(x + Math.cos(a) * r * 0.86, base, z + Math.sin(a) * r * 0.86, -a), -0.5, H, -0.5, 0.5, H + 1.2, 0.5, col, null, 0.9);
        }
        const q = r * 0.66;
        geo.quad(F.p(-q, H - 0.01, -q), F.p(q, H - 0.01, -q), F.p(q, H - 0.01, q), F.p(-q, H - 0.01, q), stoneD, 0, [0, 1, 0]);
      } else cone(geo, F, r * 1.18, H, H + r * 2.2, 10, roofCol || slate, mulc(roofCol || slate, 0.5));
      // окна-бойницы
      for (let k = 0; k < Math.floor(h / 6); k++) {
        const a = rnd() * 6.28, y = 4 + k * 6 + (ground(x, z) - base);
        const nx = Math.cos(a), nz = Math.sin(a);
        const px = nx * (r * 0.93 + 0.05), pz = nz * (r * 0.93 + 0.05), tx = -nz * 0.35, tz = nx * 0.35;
        geo.quad(F.p(px - tx, y, pz - tz), F.p(px + tx, y, pz + tz), F.p(px + tx, y + 1.3, pz + tz), F.p(px - tx, y + 1.3, pz - tz), glass, 0.05 + rnd() * 0.5, F.n(nx, 0, nz));
      }
      return base + H;
    }
    function wallSeg(ax, az, bx, bz, h, th, col, crenel) {
      const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bz - az, bx - ax);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const base = minGround(frame(cx, 0, cz, yaw), len / 2, th / 2) - 0.6;
      const top = Math.max(ground(ax, az), ground(bx, bz)) + h;
      const F = frame(cx, base, cz, yaw);
      box(geo, F, -len / 2, 0, -th / 2, len / 2, top - base, th / 2, col, mulc(col, 0.85), 0.6);
      if (crenel) for (let s = -len / 2 + 0.6; s < len / 2 - 0.6; s += 2.2) box(geo, F, s, top - base, th / 2 - 0.7, s + 1.1, top - base + 1.2, th / 2, col, null, 0.95);
      return top;
    }

    for (const s of S) {
      if (s.type === 'city') {
        const ang = rnd() * Math.PI;
        const dirA = [Math.cos(ang), Math.sin(ang)], dirB = [-Math.sin(ang), Math.cos(ang)];
        const streets = [];
        const rr = s.r;
        const addSt = (ox, oz, d, w, main) => {
          // отрезок, обрезанный кругом города
          const b = ox * d[0] + oz * d[1], c = ox * ox + oz * oz - rr * rr, disc = b * b - c;
          if (disc <= 0) return;
          const t0 = -b - Math.sqrt(disc), t1 = -b + Math.sqrt(disc);
          streets.push({ ax: s.x + ox + d[0] * t0, az: s.z + oz + d[1] * t0, bx: s.x + ox + d[0] * t1, bz: s.z + oz + d[1] * t1, w, main, d });
        };
        addSt(0, 0, dirA, 9, true);
        addSt(0, 0, dirB, 8, true);
        const sp = 46 + rnd() * 10;
        for (let k = 1; k * sp < rr - 20; k++)
          for (const sg of [1, -1]) {
            addSt(dirB[0] * k * sp * sg, dirB[1] * k * sp * sg, dirA, 6, false);
            addSt(dirA[0] * k * sp * sg, dirA[1] * k * sp * sg, dirB, 6, false);
          }
        s.streets = streets;
        for (const st of streets) {
          paint(st.ax, st.az, st.bx, st.bz, st.w / 2, 2);
          paint(st.ax, st.az, st.bx, st.bz, st.w / 2 + 0.5, 3);
        }
        paint(s.x - 1, s.z, s.x + 1, s.z, rr * 0.92, 3, 70);
        paint(s.x - 1, s.z, s.x + 1, s.z, 22, 3);
        // дома вдоль улиц
        for (const st of streets) {
          const len = Math.hypot(st.bx - st.ax, st.bz - st.az), d = st.d, nrm = [-d[1], d[0]];
          for (const side of [1, -1]) {
            let pos = 4 + rnd() * 4;
            while (pos < len - 4) {
              const w = 7 + rnd() * 6, dep = 7 + rnd() * 4;
              const cx = st.ax + d[0] * (pos + w / 2) + nrm[0] * side * (st.w / 2 + dep / 2 + 0.8);
              const cz = st.az + d[1] * (pos + w / 2) + nrm[1] * side * (st.w / 2 + dep / 2 + 0.8);
              pos += w + 0.6 + (rnd() < 0.15 ? 5 : 0);
              const dc = Math.hypot(cx - s.x, cz - s.z);
              if (dc < 26 || dc > rr - 4) continue;
              if (rnd() > 1.15 - dc / rr) continue;
              let bad = false;
              for (const o of streets) if (o !== st && distSeg(cx, cz, o.ax, o.az, o.bx, o.bz)[0] < o.w / 2 + Math.max(w, dep) * 0.55) bad = true;
              for (const hh of houses) if (Math.hypot(hh.x - cx, hh.z - cz) < hh.r + Math.max(w, dep) * 0.5) bad = true;
              if (bad || ground(cx, cz) < 1 || riverDist(cx, cz) < 6) continue;
              const fl = dc < rr * 0.45 ? 2 + Math.floor(rnd() * 2.4) : 1 + Math.floor(rnd() * 2);
              house(cx, cz, Math.atan2(d[1], d[0]) + (side < 0 ? Math.PI : 0), w, dep, fl);
            }
            // фонари вдоль улицы
            if (st.main || rnd() < 0.5)
              for (let p = 8; p < len - 6; p += 17) {
                const lx = st.ax + d[0] * p + nrm[0] * side * (st.w / 2 - 0.5), lz = st.az + d[1] * p + nrm[1] * side * (st.w / 2 - 0.5);
                if (Math.hypot(lx - s.x, lz - s.z) < 8) continue;
                const gyy = ground(lx, lz);
                box(geo, frame(lx, gyy, lz, 0), -0.08, -0.3, -0.08, 0.08, 3.6, 0.08, lin('#232323'), null, 1);
                geo.quad([lx - 0.22, gyy + 3.55, lz], [lx + 0.22, gyy + 3.55, lz], [lx + 0.22, gyy + 4.05, lz], [lx - 0.22, gyy + 4.05, lz], lin('#ffd9a0'), 2, [0, 0, 1]);
                lantern(lx, gyy + 3.85, lz, 0.08 + rnd() * 0.12, 2.2);
              }
          }
        }
        // собор у площади
        const ca = ang + Math.PI / 4;
        const kx = s.x + Math.cos(ca) * 34, kz = s.z + Math.sin(ca) * 34;
        house(kx, kz, ang, 13, 24, 4, { wall: lin('#d9cfbd'), roof: slate });
        tower(kx + Math.cos(ang) * 10, kz + Math.sin(ang) * 10, 3.6, 30, slate);
        // фонтан на площади
        cyl(geo, frame(s.x, s.h - 0.3, s.z, 0), 4, 4, 0, 1, 12, stone, 0.8, lin('#5a7a8a'));
        lantern(s.x, s.h + 4, s.z, 0.1, 3);
        // городская стена
        if (has('castle') || has('wall') || rr > 160) {
          const nT = 14, pts = [];
          for (let k = 0; k < nT; k++) {
            const a = (k / nT) * Math.PI * 2 + 0.11;
            pts.push([s.x + Math.cos(a) * (rr + 8), s.z + Math.sin(a) * (rr + 8)]);
          }
          for (let k = 0; k < nT; k++) {
            const a = pts[k], b = pts[(k + 1) % nT];
            const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
            let gate = false;
            for (const st of streets) if (st.main && distSeg(mx, mz, st.ax, st.az, st.bx, st.bz)[0] < 30) gate = true;
            if (ground(mx, mz) < 0.5) continue;
            if (!gate) wallSeg(a[0], a[1], b[0], b[1], 8, 2.6, stone, true);
            const top = tower(a[0], a[1], 4, 12, roofC[0], { flat: k % 2 === 0 });
            lantern(a[0], top + 1.2, a[1], 0.15, 2.4);
          }
        }
        streetsShot.push(...streets.filter((st) => st.main).map((st) => Object.assign({}, st, { city: s })));
        labels.push({ x: s.x, z: s.z, y: s.h + 40, name: s.name, type: 'city' });
      } else if (s.type === 'village') {
        const n = 9 + Math.floor(rnd() * 9);
        for (let k = 0; k < n; k++) {
          const a = rnd() * 6.28, rr = 12 + rnd() * (s.r - 14);
          const x = s.x + Math.cos(a) * rr, z = s.z + Math.sin(a) * rr;
          if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < h.r + 6) || ground(x, z) < 1 || riverDist(x, z) < 6) continue;
          house(x, z, Math.atan2(s.z - z, s.x - x) + Math.PI / 2 + (rnd() - 0.5) * 0.4, 6 + rnd() * 4, 6 + rnd() * 2.5, 1 + (rnd() < 0.3 ? 1 : 0), { wall: wallC[Math.floor(rnd() * 3) + 3], roof: roofC[Math.floor(rnd() * 4)] });
        }
        paint(s.x - 1, s.z, s.x + 1, s.z, 12, 3, 140);
        lantern(s.x, s.h + 4, s.z, 0.12, 2.6);
        labels.push({ x: s.x, z: s.z, y: s.h + 22, name: s.name, type: 'village' });
      } else if (s.type === 'castle') {
        const nC = 7, pts = [];
        const rot = rnd() * 6;
        for (let k = 0; k < nC; k++) {
          const a = (k / nC) * Math.PI * 2 + rot, rr = s.r * (0.72 + rnd() * 0.18);
          pts.push([s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr]);
        }
        const red = rnd() < 0.5;
        const roofCol = red ? lin('#7a2f24') : lin('#3a4a6a');
        for (let k = 0; k < nC; k++) {
          const a = pts[k], b = pts[(k + 1) % nC];
          wallSeg(a[0], a[1], b[0], b[1], 11, 3.2, stone, true);
          const top = tower(a[0], a[1], 5, 17 + rnd() * 5, roofCol, { flat: k === 0 });
          lantern(a[0], top - 6, a[1], 0.12, 2.6);
        }
        // донжон
        const F = frame(s.x, s.h - 0.5, s.z, rot);
        box(geo, F, -8, 0, -8, 8, 28, 8, stone, stoneD, 0.6);
        for (let s2 = -7.4; s2 < 7.5; s2 += 2.4)
          for (const zz of [-7.6, 7.6]) {
            box(geo, F, s2, 28, zz - 0.5, s2 + 1.2, 29.3, zz + 0.5, stone, null, 0.95);
            box(geo, F, zz - 0.5, 28, s2, zz + 0.5, 29.3, s2 + 1.2, stone, null, 0.95);
          }
        for (const [cx, cz] of [[-8, -8], [8, -8], [8, 8], [-8, 8]]) {
          const p = F.p(cx, 0, cz);
          cyl(geo, frame(p[0], s.h + 22, p[2], 0), 2.2, 2.2, 0, 10, 8, stone, 0.85);
          cone(geo, frame(p[0], s.h + 31.5, p[2], 0), 2.8, 0, 6, 8, roofCol, mulc(roofCol, 0.5));
        }
        for (let fl = 0; fl < 6; fl++)
          for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const y = 4 + fl * 4, off = (rnd() - 0.5) * 8;
            const p0 = F.p(nx * 8.05 + nz * (off - 0.5), y, nz * 8.05 + nx * (off - 0.5)), p1 = F.p(nx * 8.05 + nz * (off + 0.5), y, nz * 8.05 + nx * (off + 0.5));
            geo.quad(p0, p1, [p1[0], p1[1] + 1.7, p1[2]], [p0[0], p0[1] + 1.7, p0[2]], glass, 0.05 + rnd() * 0.5, F.n(nx, 0, nz));
          }
        // знамя
        const fp = [s.x, s.h + 36, s.z];
        box(geo, frame(s.x, s.h + 28, s.z, 0), -0.1, 0, -0.1, 0.1, 9, 0.1, lin('#333333'), null, 1);
        const flag = red ? lin('#2a4a9a') : lin('#b33a2a');
        geo.tri(fp, [fp[0] + 3.5, fp[1] + 0.6, fp[2]], [fp[0], fp[1] + 1.8, fp[2]], flag, 0, [0, 0, 1]);
        geo.tri(fp, [fp[0], fp[1] + 1.8, fp[2]], [fp[0] + 3.5, fp[1] + 0.6, fp[2]], flag, 0, [0, 0, -1]);
        lantern(s.x, s.h + 30, s.z, 0.1, 3.5);
        paint(s.x - 1, s.z, s.x + 1, s.z, s.r * 0.7, 3, 170);
        labels.push({ x: s.x, z: s.z, y: s.h + 48, name: s.name, type: 'castle' });
      } else if (s.type === 'lighthouse') {
        const base = ground(s.x, s.z) - 1;
        const F = frame(s.x, base, s.z, 0);
        cyl(geo, F, 5, 5, 0, 4, 12, stoneD, 0.7, stone);
        for (let k = 0; k < 6; k++) cyl(geo, F, 3.3 - k * 0.18, 3.3 - (k + 1) * 0.18, 4 + k * 4, 8 + k * 4, 12, k % 2 ? lin('#b8322a') : lin('#f2eee6'), 0.85);
        cyl(geo, F, 2.6, 2.6, 28, 28.6, 12, lin('#2a2a2a'), 1, lin('#2a2a2a'));
        cyl(geo, F, 1.7, 1.7, 28.6, 31.4, 10, lin('#fff1c8'), 1);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
          const p = F.p(Math.cos(a) * 1.75, 28.8, Math.sin(a) * 1.75), q = F.p(Math.cos(a1) * 1.75, 28.8, Math.sin(a1) * 1.75);
          geo.quad(p, q, [q[0], q[1] + 2.4, q[2]], [p[0], p[1] + 2.4, p[2]], lin('#fff3c4'), 2, F.n(Math.cos(a), 0, Math.sin(a)));
        }
        cone(geo, F, 2.4, 31.4, 34.5, 10, lin('#8a2a22'), lin('#4a1a14'));
        sprites.push(s.x, base + 30, s.z, 10, 3, 0, 1);
        lightsPts.push(s.x, s.z, 1.5);
        house(s.x + 9, s.z + 4, 0.4, 7, 6, 1, { wall: lin('#f0ebe2'), roof: lin('#8a2a22') });
        labels.push({ x: s.x, z: s.z, y: base + 44, name: s.name, type: 'lighthouse' });
      } else if (s.type === 'tower') {
        const top = tower(s.x, s.z, 5.5, 34, lin('#4a3a6a'));
        lantern(s.x, top - 5, s.z, 0.1, 2.5);
        labels.push({ x: s.x, z: s.z, y: top + 18, name: s.name, type: 'tower' });
      } else if (s.type === 'temple') {
        house(s.x, s.z, rnd() * 3, 14, 26, 4, { wall: lin('#e2dccd'), roof: slate });
        tower(s.x + 13, s.z, 4, 32, slate);
        labels.push({ x: s.x, z: s.z, y: s.h + 50, name: s.name, type: 'temple' });
      }
    }
    // Мосты
    for (const b of bridges) {
      const len = Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z), yaw = Math.atan2(b.b.z - b.a.z, b.b.x - b.a.x);
      const F = frame((b.a.x + b.b.x) / 2, b.h, (b.a.z + b.b.z) / 2, yaw);
      box(geo, F, -len / 2 - 2, -1.2, -b.w / 2, len / 2 + 2, 0.2, b.w / 2, stone, lin('#8a7a64'), 0.8);
      for (let s = -len / 2; s <= len / 2; s += Math.max(5, len / 3)) box(geo, F, s - 0.8, -12, -b.w / 2, s + 0.8, -1, b.w / 2, stoneD, null, 0.5);
      for (const zz of [-b.w / 2, b.w / 2 - 0.4]) box(geo, F, -len / 2 - 2, 0.2, zz, len / 2 + 2, 1.1, zz + 0.4, stone, null, 0.9);
      const pm = F.p(0, 0, 0);
      lantern(pm[0], pm[1] + 2.5, pm[2], 0.2, 2);
    }
    // Великая стена: если в книге «на западе стена»
    for (const wd of dirs('wall').slice(0, 2)) {
      const off = 0.58, nx = -wd.y, nz = wd.x;
      let prev = null;
      for (let s = -0.95, k = 0; s <= 0.95; s += 10 / R, k++) {
        const wob = noise.n2(s * 3, 7) * 0.05;
        const p = [(wd.x * (off + wob) + nx * s) * R, (wd.y * (off + wob) + nz * s) * R];
        const g = ground(p[0], p[1]);
        if (prev && g > 0.5 && ground(prev[0], prev[1]) > 0.5) wallSeg(prev[0], prev[1], p[0], p[1], 10, 5, lin('#a39a8c'), true);
        prev = p;
        if (k % 11 === 0 && g > 0.5) {
          box(geo, frame(p[0], g - 1, p[1], Math.atan2(nz, nx)), -4.5, 0, -4.5, 4.5, 17, 4.5, lin('#9a9184'), lin('#7a7166'), 0.6);
          lantern(p[0], g + 18, p[1], 0.15, 2.6);
        }
      }
      const lx = wd.x * off * R, lz = wd.y * off * R;
      labels.push({ x: lx, z: lz, y: ground(lx, lz) + 30, type: 'wall', quote: wd.quote });
    }

    /* ----- Поля вокруг деревень и городов (R — поле, G — культура) ----- */
    const fieldsAt = [];
    for (const s of S) {
      if (s.type !== 'village' && s.type !== 'city') continue;
      const n = s.type === 'village' ? 22 : 16;
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.28, dd = s.r + 25 + rnd() * 260;
        const cx = s.x + Math.cos(a) * dd, cz = s.z + Math.sin(a) * dd;
        if (Math.abs(cx) > R - 60 || Math.abs(cz) > R - 60) continue;
        const w = 40 + rnd() * 60, d = 30 + rnd() * 50, yaw = a + (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.3;
        const F = frame(cx, 0, cz, yaw);
        let ok = true, hmin = 1e9, hmax = -1e9;
        for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]]) {
          const p = F.p(px, 0, pz), h = ground(p[0], p[2]);
          hmin = Math.min(hmin, h);
          hmax = Math.max(hmax, h);
          if (riverDist(p[0], p[2]) < 4) ok = false;
          for (const o of S) if (Math.hypot(o.x - p[0], o.z - p[2]) < o.r + 8) ok = false;
          for (const l of lakes) if (Math.hypot(l.x - p[0], l.z - p[2]) < l.r + 6) ok = false;
        }
        if (!ok || hmin < 2 || hmax - hmin > 14 || hmax > snowLine - 60) continue;
        const crop = 1 + Math.floor(rnd() * 6);
        const c = Math.cos(yaw), sn = Math.sin(yaw), ext = Math.hypot(w, d) / 2 + 2;
        const i0 = Math.max(0, Math.floor(texI(cx - ext))), i1 = Math.min(TEX - 1, Math.ceil(texI(cx + ext)));
        const j0 = Math.max(0, Math.floor(texI(cz - ext))), j1 = Math.min(TEX - 1, Math.ceil(texI(cz + ext)));
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const x = ((i + 0.5) / TEX) * 2 * R - R - cx, z = ((j + 0.5) / TEX) * 2 * R - R - cz;
            const lx = x * c + z * sn, lz = -x * sn + z * c;
            if (Math.abs(lx) < w / 2 && Math.abs(lz) < d / 2) {
              const q = (j * TEX + i) * 4;
              map[q] = Math.round(sstep(0, 3.5, Math.min(w / 2 - Math.abs(lx), d / 2 - Math.abs(lz))) * 255);
              map[q + 1] = crop * 36;
            }
          }
        fieldsAt.push({ x: cx, z: cz, r: Math.min(w, d) / 2, home: s });
      }
      // Хутора у полей
      if (s.type === 'village')
        for (let k = 0; k < 2; k++) {
          const fa = fieldsAt[fieldsAt.length - 1 - k * 3];
          if (!fa || fa.home !== s) continue;
          const x = fa.x + fa.r + 8, z = fa.z;
          if (ground(x, z) > 2 && !houses.some((h) => Math.hypot(h.x - x, h.z - z) < 14) && riverDist(x, z) > 8) house(x, z, rnd() * 6, 9, 7, 1, { wall: lin('#b0402e'), roof: lin('#4a4a4a') });
        }
    }
    const mapAt = (x, z, ch) => {
      const i = clamp(Math.floor(texI(x)), 0, TEX - 1), j = clamp(Math.floor(texI(z)), 0, TEX - 1);
      return map[(j * TEX + i) * 4 + ch];
    };

    /* ----- Цвет и нормали земли ----- */
    function colorAt(x, z, h, slope, fk) {
      const u = x / R, v = z / R;
      const n1 = noise.fbm(u * 7 + 3, v * 7 + 1, 3), n2 = noise.n2(u * 30, v * 30);
      let c = mixc(C.grass, C.grass2, sstep(0.35, 0.7, n1));
      c = mixc(c, C.meadow, sstep(0.5, 0.8, n2) * 0.4);
      c = mixc(c, C.forest, fk * 0.75);
      for (const b of L.swamps) c = mixc(c, C.swamp, blobK(u, v, b) * 0.85);
      for (const b of L.deserts) c = mixc(c, C.desert, sstep(0.25, 0.6, blobK(u, v, b)));
      c = mixc(c, C.dirt, sstep(0.2, 0.32, slope) * 0.35);
      const coastSand = h < 3.2 && h > -1 ? sstep(3.2, 1.2, h + n2 * 1.2) : 0;
      c = mixc(c, C.sand, coastSand * (coastal ? 1 : 0.4));
      c = mixc(c, C.wet, sstep(0.6, -0.3, h) * 0.6);
      const rockline = snowLine - 70;
      c = mixc(c, mixc(C.rock, C.rock2, n1), clamp(sstep(0.48, 0.75, slope) + sstep(rockline - 30, rockline + 50, h + n1 * 40) * 0.8, 0, 1));
      const sn = sstep(snowLine, snowLine + 30, h + n1 * 50) * (1 - sstep(0.85, 1.1, slope));
      c = mixc(c, C.snow, Math.max(sn, winter * 0.85 * (1 - sstep(0.6, 0.9, slope)) * sstep(-0.5, 1.5, h)));
      if (h < -0.8) c = mixc(C.seabed, C.wet, sstep(-6, -0.8, h));
      return c;
    }
    // Верх кубика: трава, цветы, песок, снег. Бок: дёрн → земля → камень, или сплошной камень/песок
    const S8 = (c) => {
      const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
      return [0, 1, 2].map((k) => clamp(Math.round(Math.pow(clamp(l + (c[k] - l) * 1.12, 0, 1), 1 / 2.2) * 255), 0, 255));
    };
    function voxTex(n, cw, org, vy, levAt, skip) {
      const top = new Uint8Array(n * n * 4), side = new Uint8Array(n * n * 4);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          if (skip && skip(i, j)) continue;
          const x = org + (i + 0.5) * cw, z = org + (j + 0.5) * cw;
          const L0 = levAt(i, j), h = L0 * vy + 0.6;
          let dmax = 0;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dmax = Math.max(dmax, Math.abs(levAt(clamp(i + di, 0, n - 1), clamp(j + dj, 0, n - 1)) - L0));
          const slope = (dmax * vy) / cw;
          let c = colorAt(x, z, h, slope * 0.7, forestK(x / R, z / R));
          const snowy = c[0] > 0.6 && c[2] > 0.6;
          const sandy = !snowy && h < 3.5 && h > -0.5 && coastal;
          const rocky = !snowy && (slope > 1.4 || h > snowLine - 90);
          // цветы на лугах: густота пятнами
          let fd = 0;
          if (!snowy && !sandy && !rocky && h > 3 && cw < 20) fd = sstep(0.45, 0.75, noise.fbm(x * 0.006 + 40, z * 0.006 + 11, 3)) * (1 - forestK(x / R, z / R)) + 0.08;
          const q = (j * n + i) * 4;
          const t8 = S8(c);
          top[q] = t8[0];
          top[q + 1] = t8[1];
          top[q + 2] = t8[2];
          top[q + 3] = clamp(L0 + 64, 0, 255);
          const sc = snowy || rocky ? mixc(C.rock, C.rock2, noise.n2(x * 0.01, z * 0.01)) : sandy ? C.sand : h < -0.5 ? C.seabed : lin('#5e4330');
          const s8 = S8(sc);
          side[q] = s8[0];
          side[q + 1] = s8[1];
          side[q + 2] = s8[2];
          side[q + 3] = snowy || rocky || sandy || h < -0.5 ? 0 : 128 + Math.round(clamp(fd, 0, 1) * 127);
        }
      return { top, side };
    }
    // Сетка из кубиков: верхушки склеены в полосы, бока — от соседа до соседа
    function voxMesh(n, levAt, skip, low) {
      const out = [];
      const q = (a, b, c, d, nid) => out.push(a[0], a[1], a[2], nid, b[0], b[1], b[2], nid, c[0], c[1], c[2], nid, a[0], a[1], a[2], nid, c[0], c[1], c[2], nid, d[0], d[1], d[2], nid);
      const lv = (i, j) => (i < 0 || j < 0 || i >= n || j >= n || (skip && skip(i, j)) ? low : levAt(i, j));
      for (let j = 0; j < n; j++) {
        let i = 0;
        while (i < n) {
          if (skip && skip(i, j)) {
            i++;
            continue;
          }
          const L0 = levAt(i, j);
          let k = i + 1;
          while (k < n && !(skip && skip(k, j)) && levAt(k, j) === L0) k++;
          q([i, L0, j], [k, L0, j], [k, L0, j + 1], [i, L0, j + 1], 0);
          i = k;
        }
      }
      for (let i = 0; i <= n; i++) {
        let j = 0;
        while (j < n) {
          const a = lv(i - 1, j), b = lv(i, j);
          if (a === b) {
            j++;
            continue;
          }
          let k = j + 1;
          while (k < n && lv(i - 1, k) === a && lv(i, k) === b) k++;
          if (a > b) q([i, b, j], [i, b, k], [i, a, k], [i, a, j], 1);
          else q([i, a, j], [i, a, k], [i, b, k], [i, b, j], 2);
          j = k;
        }
      }
      for (let j = 0; j <= n; j++) {
        let i = 0;
        while (i < n) {
          const a = lv(i, j - 1), b = lv(i, j);
          if (a === b) {
            i++;
            continue;
          }
          let k = i + 1;
          while (k < n && lv(k, j - 1) === a && lv(k, j) === b) k++;
          if (a > b) q([i, b, j], [k, b, j], [k, a, j], [i, a, j], 3);
          else q([i, a, j], [k, a, j], [k, b, j], [i, b, j], 4);
          i = k;
        }
      }
      return new Int16Array(out);
    }
    const levD = (i, j) => vox[j * VN + i];
    const voxD = { mesh: voxMesh(VN, levD, null, -60), ...voxTex(VN, VB, -R, VB, levD), n: VN, cw: VB, vy: VB, org: -R };
    const fLev = new Int16Array(FVN * FVN);
    const fIn = (i, j) => {
      const x0 = -FAR + i * FB, z0 = -FAR + j * FB;
      return x0 >= -R && x0 + FB <= R && z0 >= -R && z0 + FB <= R;
    };
    for (let j = 0; j < FVN; j++) for (let i = 0; i < FVN; i++) fLev[j * FVN + i] = fIn(i, j) ? -100 : Math.round((H0(-FAR + (i + 0.5) * FB, -FAR + (j + 0.5) * FB) - 0.6) / FVH);
    const levF = (i, j) => fLev[j * FVN + i];
    const voxF = { mesh: voxMesh(FVN, levF, fIn, -100), ...voxTex(FVN, FB, -FAR, FVH, levF, fIn), n: FVN, cw: FB, vy: FVH, org: -FAR };

    /* ----- Деревья ----- */
    const inst = { conifer: [], broad: [], poplar: [] };
    const treeline = snowLine - 20;
    const near = (x, z, list, pad) => list.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + pad);
    const fallForest = (x, z) => (fall ? sstep(260, 60, Math.hypot(x - fall.x, z - fall.z)) : 0);
    const SP = 7;
    // цвет кроны: зелень, осенние рощи, цветущие сады
    const palIdx = (x, z, kind) => {
      if (kind === 'conifer') return rnd() < 0.5 ? 11 : 12;
      const au = noise.fbm(x * 0.0025 + 70, z * 0.0025 + 20, 3), bl = noise.fbm(x * 0.004 + 5, z * 0.004 + 90, 3);
      if (bl > 0.6 && rnd() < 0.7) return rnd() < 0.6 ? 8 : 9;
      if (au > 0.56 && rnd() < 0.75) return [5, 6, 7][Math.floor(rnd() * 3)];
      if (rnd() < 0.04) return 10;
      return Math.floor(rnd() * 5);
    };
    for (let z = -R + 8; z < R - 8; z += SP)
      for (let x = -R + 8; x < R - 8; x += SP) {
        const px = x + (rnd() - 0.5) * SP * 0.9, pz = z + (rnd() - 0.5) * SP * 0.9;
        const d = Math.max(forestK(px / R, pz / R), fallForest(px, pz) * 0.95);
        if (rnd() > d * 0.62 + 0.004) continue;
        const h = ground(px, pz);
        if (h < 1.2 || h > treeline + rnd() * 40) continue;
        if (slopeAt(px, pz, 5) > 0.75) continue;
        if (fall && distSeg(px, pz, fall.pool.x, fall.pool.z, fall.pool.x + fall.dx * 75, fall.pool.z + fall.dz * 75)[0] < 30) continue;
        if (riverDist(px, pz) < 3 || near(px, pz, S, 6) || near(px, pz, lakes, 3) || near(px, pz, houses, 3)) continue;
        if (mapAt(px, pz, 2) > 40 || mapAt(px, pz, 0) > 30 || mapAt(px, pz, 3) > 30) continue;
        const sc = 0.75 + rnd() * 0.55;
        const kind = h > 110 || (has('snow') && rnd() < 0.5) || noise.n2(px * 0.004, pz * 0.004) > 0.62 ? 'conifer' : rnd() < 0.12 ? 'poplar' : 'broad';
        inst[kind].push(px, h - 0.1, pz, sc, Math.floor(rnd() * 4) * 1.5708, 1, 0, palIdx(px, pz, kind));
      }
    // Деревья вдоль дорог
    for (const rd of roads)
      for (let i = 0; i < rd.pts.length - 1; i += 3) {
        if (rnd() > 0.28) continue;
        const p = rd.pts[i], q = rd.pts[i + 1], dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
        const side = rnd() < 0.5 ? 1 : -1, x = p.x - (dz / l) * side * (rd.w + 3), z = p.z + (dx / l) * side * (rd.w + 3);
        const h = ground(x, z);
        if (h < 1.5 || near(x, z, S, 4) || near(x, z, houses, 3) || riverDist(x, z) < 3 || mapAt(x, z, 3) > 30) continue;
        const kd = rnd() < 0.5 ? 'poplar' : 'broad';
        inst[kd].push(x, h - 0.1, z, 0.8 + rnd() * 0.4, Math.floor(rnd() * 4) * 1.5708, 1, 0, palIdx(x, z, kd));
      }
    let total = (inst.conifer.length + inst.broad.length + inst.poplar.length) / 8;
    const CAP = 12000;
    if (total > CAP)
      for (const k in inst) {
        const a = inst[k], keep = [];
        for (let i = 0; i < a.length; i += 8) if (rnd() < CAP / total) for (let q = 0; q < 8; q++) keep.push(a[i + q]);
        inst[k] = keep;
      }
    total = (inst.conifer.length + inst.broad.length + inst.poplar.length) / 8;

    /* ----- Облака из кубиков ----- */
    inst.cloud = [];
    for (let k = 0; k < 30; k++) {
      const x = (rnd() - 0.5) * 16000, z = (rnd() - 0.5) * 12000;
      inst.cloud.push(x, 520 + rnd() * 320, z, 1 + rnd() * 1.8, Math.floor(rnd() * 4) * 1.5708, 0, 0, -2);
    }

    /* ----- Лодки ----- */
    inst.ship = [];
    if (coastal) {
      const nShip = 2 + (has('ship') ? 3 : 0) + (S.some((s) => s.type === 'city') ? 1 : 0);
      for (let k = 0, tries = 0; k < nShip && tries < 400; tries++) {
        const a = rnd() * 6.28, rr = 0.3 + rnd() * 0.7, x = Math.cos(a) * rr * R, z = Math.sin(a) * rr * R;
        if (ground(x, z) > -4 || ground(x + 20, z) > -2 || ground(x - 20, z) > -2) continue;
        inst.ship.push(x, 0, z, 1 + rnd() * 0.5, rnd() * 6.28, 0, -1, -1);
        k++;
      }
    }

    /* ----- Животные: овцы и коровы у деревень, олени у леса ----- */
    const animals = [];
    for (const fa of fieldsAt.filter((_, i) => i % 3 === 0).slice(0, 8)) {
      const type = rnd() < 0.6 ? 'sheep' : 'cow';
      const n = type === 'sheep' ? 6 + Math.floor(rnd() * 8) : 3 + Math.floor(rnd() * 4);
      const a = rnd() * 6.28, hx = fa.x + Math.cos(a) * (fa.r + 30), hz = fa.z + Math.sin(a) * (fa.r + 30);
      if (ground(hx, hz) < 2 || mapAt(hx, hz, 0) > 30 || near(hx, hz, S, 4)) continue;
      for (let i = 0; i < n; i++) {
        const x = hx + (rnd() - 0.5) * 30, z = hz + (rnd() - 0.5) * 30;
        animals.push({ type, x, z, yaw: rnd() * 6.28, hx, hz, hr: 22, tx: x, tz: z, sp: type === 'sheep' ? 0.5 : 0.4, wait: rnd() * 8 });
      }
    }
    for (let k = 0, tries = 0; k < 4 && tries < 300; tries++) {
      const x = (rnd() - 0.5) * 1.7 * R, z = (rnd() - 0.5) * 1.7 * R;
      const d = forestK(x / R, z / R);
      if (d < 0.2 || d > 0.6 || ground(x, z) < 3 || ground(x, z) > treeline || near(x, z, S, 20) || slopeAt(x, z) > 0.3) continue;
      const n = 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) animals.push({ type: 'deer', x: x + (rnd() - 0.5) * 16, z: z + (rnd() - 0.5) * 16, yaw: rnd() * 6.28, hx: x, hz: z, hr: 30, tx: x, tz: z, sp: 1.1, wait: rnd() * 6 });
      k++;
    }
    if (fall)
      for (let i = 0; i < 3; i++) {
        const x = fall.pool.x + fall.dz * (26 + i * 3), z = fall.pool.z - fall.dx * (26 + i * 3);
        if (ground(x, z) > fall.bot) animals.push({ type: 'deer', x, z, yaw: rnd() * 6.28, hx: x, hz: z, hr: 10, tx: x, tz: z, sp: 0.9, wait: rnd() * 6 });
      }

    /* ----- Вода: море, озёра, реки, водопад ----- */
    const water = []; // x, y, z, течение x, течение z
    const wq = (x0, z0, x1, z1, y) => water.push(x0, y, z0, 0, 0, x1, y, z0, 0, 0, x1, y, z1, 0, 0, x0, y, z0, 0, 0, x1, y, z1, 0, 0, x0, y, z1, 0, 0);
    wq(-16000, -16000, 16000, 16000, 0);
    for (const l of lakes)
      for (let k = 0; k < 32; k++) {
        const a0 = (k / 32) * 6.2832, a1 = ((k + 1) / 32) * 6.2832, rr = l.r * 1.22;
        water.push(l.x, l.L, l.z, 0, 0, l.x + Math.cos(a0) * rr, l.L, l.z + Math.sin(a0) * rr, 0, 0, l.x + Math.cos(a1) * rr, l.L, l.z + Math.sin(a1) * rr, 0, 0);
      }
    for (const rv of rivers) {
      const P = rv.pts;
      const pp = (k) => {
        const p = P[clamp(k, 0, P.length - 1)], q = P[clamp(k + 1, 0, P.length - 1)], r0 = P[clamp(k - 1, 0, P.length - 1)];
        const d = norm3([q.x - r0.x, q.z - r0.z, 0]);
        return [p.x, p.z, -d[1], d[0]];
      };
      for (let i = 0; i < P.length - 1; i++) {
        if (fall && i >= fall.k - 1 && i <= fall.k + 1) continue;
        const a = P[i], b = P[i + 1];
        const d0 = norm3([b.x - a.x, b.z - a.z, 0]);
        const A = pp(i), B = pp(i + 1);
        const wa = rv.wid[i] * 1.25, wb = rv.wid[i + 1] * 1.25;
        const ya = rv.wl[i], yb = rv.wl[i + 1];
        const fx = d0[0] * 1.5, fz = d0[1] * 1.5;
        const v = (p, s, w, y) => water.push(p[0] + p[2] * s * w, y, p[1] + p[3] * s * w, fx, fz);
        v(A, -1, wa, ya); v(A, 1, wa, ya); v(B, 1, wb, yb);
        v(A, -1, wa, ya); v(B, 1, wb, yb); v(B, -1, wb, yb);
      }
    }
    const falls = [];
    if (fall) {
      // лента падающей воды + брызги внизу
      const nx = -fall.dz, nz = fall.dx, w = fall.w;
      const top = fall.top, bot = fall.bot - 0.4;
      const SEG = 6;
      const bow = (s) => (1 - s * s) * 1.6;
      const p = (s, yy, tt) => [fall.x + nx * s * w + fall.dx * (bow(s) + tt * 3.2), yy, fall.z + nz * s * w + fall.dz * (bow(s) + tt * 3.2)];
      for (let k = 0; k < SEG; k++) {
        const s0 = -1 + (2 * k) / SEG, s1 = -1 + (2 * (k + 1)) / SEG;
        const A0 = p(s0, top, 0), A1 = p(s1, top, 0), B0 = p(s0, bot, 1), B1 = p(s1, bot, 1);
        const u0 = k / SEG, u1 = (k + 1) / SEG;
        falls.push(...A0, u0, 0, ...A1, u1, 0, ...B1, u1, 1, ...A0, u0, 0, ...B1, u1, 1, ...B0, u0, 1);
      }
      for (let i = 0; i < 46; i++) {
        const s = (rnd() - 0.5) * 2;
        sprites.push(fall.x + nx * s * w + fall.dx * (4 + rnd() * 8), bot + rnd() * 2, fall.z + nz * s * w + fall.dz * (4 + rnd() * 8), 5 + rnd() * 5, 2, rnd(), 0.5);
      }
      labels.push({ x: fall.x, z: fall.z, y: top + 14, type: 'waterfall', quote: (f.quotes.waterfall || f.quotes.river || [])[0] });
    }
    for (const l of lakes) if (l.name) labels.push({ x: l.x, z: l.z, y: l.L + 12, name: l.name, type: 'lake' });
    for (const m of L.mts) {
      const x = m.x * R * 0.9, z = m.y * R * 0.9;
      labels.push({ x, z, y: ground(x, z) + 60, type: 'mountain', name: (f.names.find((n) => n.type === 'mountain') || {}).name, quote: (f.quotes.mountain || [])[0] });
    }

    /* ----- Светлячки у леса и воды ----- */
    for (let k = 0, tries = 0; k < 360 && tries < 6000; tries++) {
      const x = (rnd() - 0.5) * 2 * R * 0.95, z = (rnd() - 0.5) * 2 * R * 0.95;
      const d = Math.max(forestK(x / R, z / R), fallForest(x, z));
      const wet = riverDist(x, z) < 25 || near(x, z, lakes, 25);
      if (!wet && (d < 0.25 || d > 0.75)) continue;
      const h = ground(x, z);
      if (h < 0.5) continue;
      sprites.push(x, h + 1 + rnd() * 2.5, z, 0.45, 1, rnd(), 1);
      k++;
    }

    /* ----- Световые пятна на земле (ночью) и карта высот ----- */
    const pool = new Float32Array(HT * HT);
    for (let k = 0; k < lightsPts.length; k += 3) {
      const ci = ((lightsPts[k] + R) / (2 * R)) * HT, cj = ((lightsPts[k + 1] + R) / (2 * R)) * HT, s = lightsPts[k + 2];
      for (let j = Math.floor(cj - 3); j <= Math.ceil(cj + 3); j++)
        for (let i = Math.floor(ci - 3); i <= Math.ceil(ci + 3); i++) {
          if (i < 0 || j < 0 || i >= HT || j >= HT) continue;
          const d2 = (i + 0.5 - ci) ** 2 + (j + 0.5 - cj) ** 2;
          pool[j * HT + i] += Math.exp(-d2 / 2.2) * 0.42 * s;
        }
    }
    const hmap = new Uint8Array(HT * HT * 4);
    for (let j = 0; j < HT; j++)
      for (let i = 0; i < HT; i++) {
        const x = ((i + 0.5) / HT) * 2 * R - R, z = ((j + 0.5) / HT) * 2 * R - R;
        const v = clamp(Math.round((ground(x, z) + 200) * 100), 0, 65535);
        const q = (j * HT + i) * 4;
        hmap[q] = v >> 8;
        hmap[q + 1] = v & 255;
        hmap[q + 3] = 255;
      }

    /* ----- Кадры для «загрузочных экранов» ----- */
    const shots = {
      street: streetsShot, fall, castles: S.filter((s) => s.type === 'castle'), cities: S.filter((s) => s.type === 'city'),
      lighthouse: S.find((s) => s.type === 'lighthouse'), fields: fieldsAt,
    };
    if (coastal) {
      let best = null, bs = 1e9;
      for (let k = 0; k < 400; k++) {
        const a = rnd() * 6.28, rr = 0.2 + rnd() * 0.75, x = Math.cos(a) * rr * R, z = Math.sin(a) * rr * R;
        const h = ground(x, z);
        if (h < 1 || h > 8) continue;
        let wet = 0;
        for (let q = 0; q < 8; q++) if (ground(x + Math.cos(q * 0.785) * 60, z + Math.sin(q * 0.785) * 60) < -1) wet++;
        if (wet < 2 || wet > 5) continue;
        const sc = shots.lighthouse ? Math.hypot(x - shots.lighthouse.x, z - shots.lighthouse.z) : rnd() * 100;
        if (sc < bs && sc > (shots.lighthouse ? 120 : -1)) {
          bs = sc;
          best = { x, z };
        }
      }
      shots.coast = best;
    }
    const pois = [...S.map((s) => ({ x: s.x, z: s.z })), ...(fall ? [{ x: fall.x, z: fall.z }] : []), ...lakes.filter((l) => !l.swamp).map((l) => ({ x: l.x, z: l.z })), ...L.mts.map((m) => ({ x: m.x * R * 0.7, z: m.y * R * 0.7 }))];
    if (!pois.length) pois.push({ x: 0, z: 0 });

    const objects = new Float32Array(geo.a);
    return {
      f, R, ground, H0, voxD, voxF, objects, map, hmap, pool, sprites: new Float32Array(sprites), inst, animals,
      water: new Float32Array(water), falls: new Float32Array(falls), labels, shots, pois, coastal, S, lakes,
      stats: { ms: Math.round(performance.now() - T0), trees: total, houses: houses.length },
    };
  }

  /* =========================================================
     3. ШЕЙДЕРЫ
     ========================================================= */
  const PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const COMMON = `
uniform vec3 uEye; uniform vec3 uL; uniform vec3 uLCol; uniform vec3 uSkyA; uniform vec3 uGndA;
uniform vec3 uFogC; uniform vec3 uGlow; uniform float uFogD; uniform float uNight; uniform float uTime; uniform float uExp;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunD; uniform float uOn; uniform float uR; uniform float uFade; uniform float uPoolK;
uniform sampler2D uLight;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.,0.)), u.x), mix(hash12(i+vec2(0.,1.)), hash12(i+vec2(1.,1.)), u.x), u.y); }
float fbm3(vec2 p){ return vnoise(p)*.5 + vnoise(p*2.03+7.1)*.25 + vnoise(p*4.11+3.7)*.125 + .0625; }
vec2 regUV(vec3 wp){ return (wp.xz + uR) / (2.*uR); }
float inReg(vec2 uv){ return step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.); }
vec2 lightAt(vec3 wp){ vec2 uv = regUV(wp); vec2 s = texture2D(uLight, uv).rg; float k = inReg(uv); return vec2(mix(1., s.r, k), s.g * k); }
vec3 shade(vec3 alb, vec3 N, vec3 wp, float ao, float wrap){
  vec2 ls = lightAt(wp);
  float d = clamp((dot(N, uL) + wrap) / (1. + wrap), 0., 1.) * ls.x;
  vec3 amb = mix(uGndA, uSkyA, N.y * .5 + .5) * ao;
  vec3 c = alb * (uLCol * d + amb);
  c = mix(c, vec3(dot(c, vec3(.3, .59, .11))) * vec3(.72, .86, 1.2), uNight * .6);
  return c + alb * vec3(1., .55, .22) * ls.y * ls.y * uOn * .9 * uPoolK;
}
vec3 skyCol(vec3 r){
  float y = max(r.y, 0.);
  vec3 c = mix(uHor, uZen, pow(y, .55));
  float sd = max(dot(r, uSunD), 0.);
  c += uGlow * (pow(sd, 5.) * .5 + pow(sd, 40.) * .9);
  c = mix(c, uFogC, (1. - smoothstep(-.03, .16, r.y)) * .55);
  return c;
}
vec3 fogIt(vec3 c, vec3 wp){
  vec3 d = wp - uEye; float dist = length(d); vec3 v = d / max(dist, .001);
  float hf = exp(-max(wp.y, 0.) * .0035);
  float f = 1. - exp(-dist * uFogD * (.35 + .65 * hf));
  float sg = pow(max(dot(v, uSunD), 0.), 6.);
  return mix(c, mix(uFogC, uGlow, sg * .5), clamp(f, 0., 1.));
}
vec3 tone(vec3 x){ x *= uExp; x = (x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14); return pow(clamp(x, 0., 1.), vec3(.4545)) * uFade; }
`;
  // Все программы делят номера атрибутов
  const ATTR = { aPos: 0, aNrm: 1, aCol: 2, aX: 3, iA: 4, iB: 5 };
  const VS_FULL = 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }';
  const FS_SKY = PREC + COMMON + `
varying vec2 vUv; uniform vec3 uCF; uniform vec3 uCR; uniform vec3 uCU; uniform vec2 uTan; uniform vec3 uMoonD; uniform float uCloud; uniform vec3 uSunC;
void main(){
  vec2 p = vUv * 2. - 1.;
  vec3 r = normalize(uCF + p.x * uTan.x * uCR + p.y * uTan.y * uCU);
  vec3 c = skyCol(r);
  float sd = dot(r, uSunD);
  c += uSunC * smoothstep(.99935, .99965, sd) * 14.;
  float md = dot(r, uMoonD);
  c += vec3(.85, .9, 1.) * (smoothstep(.99955, .9998, md) * 3. + pow(max(md, 0.), 300.) * .25) * uNight;
  if (r.y > 0.) {
    vec3 sp = r * 260.; vec3 cell = floor(sp);
    float h = hash12(cell.xy + cell.z * 17.31);
    float st = step(.9972, h) * smoothstep(.45, 0., length(fract(sp) - .5)) * (.55 + .45 * sin(uTime * 2.3 + h * 300.));
    c += vec3(.9, .95, 1.) * st * uNight * 1.6 * smoothstep(0., .2, r.y);
    vec2 q = r.xz / (r.y + .09) * .9 + vec2(uTime * .004, uTime * .0017);
    float d = fbm3(q * 1.6) * .65 + fbm3(q * 5.3 + 3.) * .35;
    float cov = smoothstep(.62 - uCloud * .3, .9 - uCloud * .22, d);
    float lit = .55 + .45 * smoothstep(.3, .9, fbm3(q * 1.6 + vec2(.08 * uSunD.x, .08 * uSunD.z)));
    vec3 cc = uSkyA * 1.05 + uLCol * .3 * lit + uGlow * pow(max(sd, 0.), 3.) * .7;
    c = mix(c, cc, cov * smoothstep(.0, .22, r.y) * .9);
  }
  gl_FragColor = vec4(tone(c), 1.);
}`;
  const VS_VOX = `attribute vec4 aPos; uniform mat4 uVP; uniform vec3 uOrg; uniform vec3 uScale;
varying vec3 vP; varying vec3 vN;
void main(){
  float id = aPos.w;
  vN = id < .5 ? vec3(0., 1., 0.) : id < 1.5 ? vec3(1., 0., 0.) : id < 2.5 ? vec3(-1., 0., 0.) : id < 3.5 ? vec3(0., 0., 1.) : vec3(0., 0., -1.);
  vP = uOrg + vec3(aPos.x * uScale.x, aPos.y * uScale.y + .6, aPos.z * uScale.z);
  gl_Position = uVP * vec4(vP, 1.);
}`;
  const FS_VOX = PREC + COMMON + `
varying vec3 vP; varying vec3 vN;
uniform sampler2D uMap; uniform sampler2D uTop; uniform sampler2D uSide;
uniform vec3 uOrg; uniform vec3 uScale; uniform float uCells; uniform float uDetail;
vec3 crop(float id){
  if (id < 1.5) return vec3(.62, .42, .07);
  if (id < 2.5) return vec3(.16, .34, .04);
  if (id < 3.5) return vec3(.2, .1, .04);
  if (id < 4.5) return vec3(.78, .62, .05);
  if (id < 5.5) return vec3(.3, .42, .07);
  return vec3(.24, .15, .36);
}
void main(){
  vec3 N = vN;
  float dist = length(vP - uEye);
  vec2 cp = vP.xz - N.xz * uScale.x * .5;
  vec2 cuv = (cp - uOrg.xz) / (uScale.x * uCells);
  vec4 tp = texture2D(uTop, cuv);
  vec3 topC = pow(tp.rgb, vec3(2.2));
  float topY = (floor(tp.a * 255. + .5) - 64.) * uScale.y + .6;
  float sub = uScale.x * .5, subY = uScale.y * .5;
  vec3 alb; vec2 g; vec2 cs; float depth = 0.;
  vec4 sd = texture2D(uSide, cuv);
  float lod = 1. - smoothstep(uScale.x * 30., uScale.x * 160., dist);
  if (N.y > .5) {
    alb = topC; g = vP.xz; cs = vec2(sub);
    // цветы — мелкие точки на лугу
    if (sd.a > .5) {
      float fd = clamp((sd.a * 255. - 128.) / 127., 0., 1.);
      vec2 fc = floor(vP.xz / (sub * .5));
      if (hash12(fc * 1.31 + 7.) < fd * .2) {
        float k = hash12(fc + 3.3);
        vec3 fl = k < .25 ? vec3(.86, .38, .55) : k < .45 ? vec3(.85, .83, .78) : k < .65 ? vec3(.86, .66, .08) : k < .82 ? vec3(.7, .1, .07) : vec3(.38, .2, .62);
        alb = mix(alb, fl, .15 + .85 * lod);
      }
    }
  } else {
    vec3 sc = pow(sd.rgb, vec3(2.2));
    depth = topY - vP.y;
    alb = sc;
    if (sd.a > .5) {
      float lip = subY * .55 + vnoise(vec2(dot(vP.xz, vec2(-N.z, N.x)) * .6, 3.)) * subY * .5;
      alb = depth < lip ? topC : (depth < uScale.y * 2.2 ? sc : vec3(.16, .15, .14));
    }
    g = vec2(dot(vP.xz, vec2(-N.z, N.x)), vP.y - .6); cs = vec2(sub, subY);
  }
  // мелкие кубики: у каждого свой оттенок и тонкий шов
  vec2 gi = floor(g / cs);
  float h1 = hash12(gi + N.xz * 17. + floor(vP.y / max(subY, 1.)) * (1. - N.y) * 3.1);
  alb *= mix(1., .82 + .36 * h1, .3 + .7 * lod);
  vec2 fr = abs(fract(g / cs) - .5);
  alb *= mix(1., .8 + .2 * smoothstep(.5, .42, max(fr.x, fr.y)), lod);
  // поля, дороги, мостовая — по клеточкам
  if (N.y > .5 && uDetail > .5) {
    vec2 cc = (floor(vP.xz / sub) + .5) * sub;
    vec2 uv = regUV(vec3(cc.x, 0., cc.y));
    vec4 m = texture2D(uMap, uv) * inReg(uv);
    if (m.r > .5) {
      float id = floor(m.g * 7.08 + .4);
      vec3 fc = crop(id) * (.85 + .3 * h1);
      float ang = id * 1.73;
      if (mod(floor(dot(cc, vec2(cos(ang), sin(ang))) / sub), 2.) < .5) fc *= .8;
      alb = fc;
    } else if (m.r > .1) alb = vec3(.05, .13, .03) * (.8 + .4 * h1);
    if (m.b > .45) alb = vec3(.28, .19, .1) * (.8 + .3 * h1) * (.85 + .3 * vnoise(vP.xz * 1.3));
    if (m.a > .45) {
      // брусчатка: мелкие камни вблизи
      vec2 gq = vP.xz * 1.6; vec2 ce = floor(gq + vec2(0., floor(gq.x) * .5));
      vec2 cf = fract(gq + vec2(0., floor(gq.x) * .5)) - .5;
      float near = 1. - smoothstep(30., 120., dist);
      alb = vec3(.17, .155, .135) * (.7 + .5 * mix(h1, hash12(ce), near)) * mix(1., .6 + .4 * smoothstep(.5, .38, max(abs(cf.x), abs(cf.y))), near);
    }
  }
  // бока внизу — в тени соседей
  alb *= mix(1., .58, smoothstep(0., uScale.y * 4., depth));
  vec3 c = shade(alb, N, vP, 1., .05);
  gl_FragColor = vec4(tone(fogIt(c, vP)), 1.);
}`;
  const VS_OBJ = `attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; attribute float aX; uniform mat4 uVP;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vE;
void main(){ vP = aPos; vN = aNrm; vC = aCol; vE = aX; gl_Position = uVP * vec4(aPos, 1.); }`;
  const FS_OBJ = PREC + COMMON + `
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vE;
void main(){
  vec3 N = normalize(vN);
  vec3 c = shade(vC, N, vP, 1., .12);
  if (vE > 1.5) {
    c = mix(c, vC * 1.4, .3) + vec3(1., .72, .4) * uOn * 3.;
  } else if (vE > 0.) {
    float on = step(vE, uOn * .62);
    vec3 V = normalize(vP - uEye);
    vec3 refl = skyCol(reflect(V, N)) * .35;
    float fl = .9 + .1 * sin(uTime * 2.7 + vE * 91.);
    vec3 warm = mix(vec3(1., .5, .16), vec3(1., .7, .38), fract(vE * 13.)) * 1.5 * fl;
    c = mix(c + refl, warm, on);
  }
  gl_FragColor = vec4(tone(fogIt(c, vP)), 1.);
}`;
  const VS_INST = `attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; attribute vec4 iA; attribute vec4 iB;
uniform mat4 uVP; uniform float uTime;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vAO; varying vec3 vLoc; varying vec3 vNl; varying float vKind;
vec3 pal(float i){
  vec3 c = i < .5 ? vec3(.25, .56, .23) : i < 1.5 ? vec3(.18, .48, .21) : i < 2.5 ? vec3(.35, .64, .25) : i < 3.5 ? vec3(.44, .66, .24) : i < 4.5 ? vec3(.16, .42, .29)
    : i < 5.5 ? vec3(.88, .54, .17) : i < 6.5 ? vec3(.79, .28, .12) : i < 7.5 ? vec3(.9, .72, .23) : i < 8.5 ? vec3(.95, .66, .78) : i < 9.5 ? vec3(.96, .94, .9)
    : i < 10.5 ? vec3(.54, .35, .69) : i < 11.5 ? vec3(.12, .3, .15) : vec3(.19, .38, .2);
  return pow(c, vec3(2.2));
}
void main(){
  float s = iA.w, cy = cos(iB.x), sy = sin(iB.x);
  vec3 p = aPos * s;
  if (iB.z > 0.) p.y += abs(sin(uTime * 7. + iA.x)) * .05 * iB.z;
  vec3 q = vec3(p.x * cy - p.z * sy, p.y, p.x * sy + p.z * cy);
  float w = iB.y * aPos.y * aPos.y * .0016 * s;
  q.x += sin(uTime * 1.3 + iA.x * .05 + iA.z * .03) * w;
  q.z += cos(uTime * 1.07 + iA.z * .05) * w * .6;
  vec3 base = iA.xyz;
  if (iB.w < -1.5) base.x = mod(iA.x + uTime * 2.5 + 9000., 18000.) - 9000.;
  vec3 wp = base + q;
  if (iB.z < 0.) wp.y += sin(uTime * .9 + iA.x) * .35;
  vP = wp;
  vN = vec3(aNrm.x * cy - aNrm.z * sy, aNrm.y, aNrm.x * sy + aNrm.z * cy);
  vC = aCol;
  if (iB.w > -.5 && abs(aCol.r - aCol.g) + abs(aCol.g - aCol.b) < .003) vC = pal(iB.w) * aCol.r * 1.1;
  vAO = iB.y > 0. ? clamp(.55 + aPos.y / 9., .55, 1.) : 1.;
  vLoc = aPos; vNl = aNrm; vKind = iB.y > 0. ? 1. : iB.w;
  gl_Position = uVP * vec4(wp, 1.);
}`;
  const FS_INST = PREC + COMMON + `
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vAO; varying vec3 vLoc; varying vec3 vNl; varying float vKind;
void main(){
  vec3 N = normalize(vN);
  vec3 alb = vC;
  float lod = 1. - smoothstep(60., 400., length(vP - uEye));
  if (vKind > .5) {
    // крона из мелких кубиков
    vec3 lp = vLoc * 1.4; vec3 an = abs(vNl);
    vec2 g2 = an.y > .5 ? lp.xz : (an.x > .5 ? lp.zy : lp.xy);
    vec2 fr = abs(fract(g2) - .5);
    float hh = hash12(floor(g2) + floor(lp.y) * 1.7 + an.xz * 5.);
    alb *= mix(1., (.8 + .36 * hh) * (.82 + .18 * smoothstep(.5, .4, max(fr.x, fr.y))), .4 + .6 * lod);
  }
  if (vKind < -1.5) {
    // облако: мягкий свет без теней от гор
    float d = clamp((dot(N, uL) + .6) / 1.6, 0., 1.);
    vec3 c = alb * (uLCol * d * .9 + uSkyA * 1.4 + uGlow * .25);
    gl_FragColor = vec4(tone(fogIt(c, vP)), 1.);
    return;
  }
  vec3 c = shade(alb, N, vP, vAO, .5) * vAO;
  vec3 V = normalize(uEye - vP);
  c += vC * uLCol * pow(max(dot(-V, uL), 0.), 4.) * .25 * lightAt(vP).x;
  gl_FragColor = vec4(tone(fogIt(c, vP)), 1.);
}`;
  const VS_WATER = `attribute vec3 aPos; attribute vec2 aX; uniform mat4 uVP; varying vec3 vP; varying vec2 vF;
void main(){ vP = aPos; vF = aX; gl_Position = uVP * vec4(aPos, 1.); }`;
  const FS_WATER = PREC + COMMON + `
varying vec3 vP; varying vec2 vF; uniform sampler2D uH; uniform vec3 uDeep; uniform vec3 uShal;
float hAt(vec2 uv){ vec4 t = texture2D(uH, uv); return (t.r * 65280. + t.g * 255.) / 100. - 200.; }
float terrH(vec2 xz){
  vec2 uv = (xz + uR) / (2. * uR);
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return -40.;
  vec2 px = uv * 256. - .5; vec2 i = floor(px), f = fract(px); float s = 1. / 256.;
  vec2 b = (i + .5) * s;
  return mix(mix(hAt(b), hAt(b + vec2(s, 0.)), f.x), mix(hAt(b + vec2(0., s)), hAt(b + vec2(s, s)), f.x), f.y);
}
void main(){
  vec3 V = normalize(vP - uEye); float dist = length(vP - uEye);
  float depth = vP.y - terrH(vP.xz);
  float t = uTime;
  vec2 q = vP.xz * .07 - vF * t * .9;
  float e = .08;
  float a0 = fbm3(q + vec2(t * .03, t * .02)), ax = fbm3(q + vec2(e + t * .03, t * .02)), az = fbm3(q + vec2(t * .03, e + t * .02));
  vec2 q2 = vP.xz * .45 - vF * t * 2.5 + vec2(-t * .12, t * .09);
  float b0 = vnoise(q2), bx = vnoise(q2 + vec2(e, 0.)), bz = vnoise(q2 + vec2(0., e));
  float k = 1. - smoothstep(200., 2500., dist);
  vec3 N = normalize(vec3((a0 - ax) * 1.8 + (b0 - bx) * .7 * k, 1., (a0 - az) * 1.8 + (b0 - bz) * .7 * k));
  vec3 Rr = reflect(V, N); Rr.y = abs(Rr.y);
  float fr = .02 + .98 * pow(1. - max(dot(-V, N), 0.), 5.);
  vec3 refl = skyCol(Rr);
  vec2 ls = lightAt(vP);
  vec3 body = mix(uShal, uDeep, 1. - exp(-max(depth, 0.) * .14)) * (uSkyA * .7 + uLCol * max(uL.y, 0.) * .45);
  vec3 c = mix(body, refl, fr * .9);
  c += uLCol * pow(max(dot(Rr, uL), 0.), 260.) * 7. * ls.x;
  float foam = smoothstep(1.4, .0, depth) * smoothstep(.4, .75, vnoise(vP.xz * .55 + vec2(t * .35, -t * .27)) + .25 * sin(depth * 5. - t * 1.8));
  vec2 fq = vP.xz * vec2(.22, .22) - vF * t * 2.2;
  foam += length(vF) * .22 * smoothstep(.62, .85, fbm3(fq + fbm3(fq * .5) * 2.));
  c = mix(c, (uSkyA + uLCol * .55) * .9, clamp(foam, 0., 1.) * .8);
  c += vec3(1., .55, .22) * ls.y * ls.y * uOn * .6 * (.6 + .4 * vnoise(vP.xz * .4 + t));
  float a = smoothstep(0., .7, depth);
  gl_FragColor = vec4(tone(fogIt(c, vP)), a);
}`;
  const VS_FALL = `attribute vec3 aPos; attribute vec2 aX; uniform mat4 uVP; varying vec3 vP; varying vec2 vUv;
void main(){ vP = aPos; vUv = aX; gl_Position = uVP * vec4(aPos, 1.); }`;
  const FS_FALL = PREC + COMMON + `
varying vec3 vP; varying vec2 vUv;
void main(){
  float s = vnoise(vec2(vUv.x * 26., vUv.y * 5. - uTime * 3.2)) * .6 + vnoise(vec2(vUv.x * 61., vUv.y * 9. - uTime * 4.1)) * .4;
  vec3 base = mix(vec3(.45, .6, .65), vec3(1.), smoothstep(.3, .8, s));
  vec3 c = base * (uSkyA * 1.1 + uLCol * .55) * (lightAt(vP).x * .4 + .6);
  float edge = smoothstep(0., .1, vUv.x) * smoothstep(1., .9, vUv.x);
  float a = (.55 + .45 * s) * edge * (.85 + .15 * vUv.y);
  c = mix(c, (uSkyA + uLCol * .6) * 1.1, smoothstep(.8, 1., vUv.y) * .7);
  gl_FragColor = vec4(tone(fogIt(c, vP)), a);
}`;
  const VS_SPR = `attribute vec3 aPos; attribute vec4 aX; uniform mat4 uVP; uniform float uPx; uniform float uTime; uniform float uOn; uniform float uNight;
uniform vec3 uEye; uniform float uFogD; uniform vec3 uSkyA; uniform vec3 uLCol; uniform float uFade;
varying vec3 vCol; varying float vKind;
void main(){
  vec3 p = aPos; float kind = aX.y, ph = aX.z; float vis = 1.; vec3 col = vec3(1., .72, .4);
  if (kind < .5) { vis = smoothstep(ph, ph + .2, uOn) * (.92 + .08 * sin(uTime * 9. + ph * 50.)); }
  else if (kind < 1.5) {
    p += vec3(sin(uTime * .5 + ph * 13.) * 2.5, sin(uTime * 1.1 + ph * 7.) * .7, cos(uTime * .45 + ph * 11.) * 2.5);
    vis = uNight * smoothstep(.2, 1., sin(uTime * 1.7 + ph * 40.)); col = vec3(.75, 1., .35) * 1.6;
  } else if (kind < 2.5) {
    float k = fract(uTime * .11 + ph);
    p.y += k * 9.; p.x += sin(ph * 30. + uTime * .3) * k * 4.;
    vis = sin(k * 3.1416) * .16; col = uSkyA * .7 + uLCol * .06;
  } else {
    vis = uOn * (.55 + .45 * pow(max(sin(uTime * 1.4), 0.), 6.)); col = vec3(1., .88, .62);
  }
  vec4 cp = uVP * vec4(p, 1.);
  gl_Position = cp;
  float dist = length(p - uEye);
  gl_PointSize = clamp(aX.x * uPx / max(cp.w, .1), 0., 220.);
  vCol = col * aX.w * vis * exp(-dist * uFogD * .7) * uFade;
  vKind = kind;
}`;
  const FS_SPR = PREC + `varying vec3 vCol; varying float vKind;
void main(){
  vec2 d = gl_PointCoord - .5; float r = length(d) * 2.;
  float a = exp(-r * r * 3.5) * (1. - smoothstep(.75, 1., r));
  if (vKind < 1.5 || vKind > 2.5) a += exp(-r * r * 60.) * 1.4;
  gl_FragColor = vec4(vCol * a, 1.);
}`;

  /* ---------- Матрицы ---------- */
  const M4 = {
    persp(fov, a, n, f) {
      const t = 1 / Math.tan(fov / 2);
      return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0];
    },
    look(e, c, u) {
      const z = norm3(sub3(e, c)), x = norm3(cross(u, z)), y = cross(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot3(x, e), -dot3(y, e), -dot3(z, e), 1];
    },
    mul(a, b) {
      const o = new Array(16);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
          o[i * 4 + j] = s;
        }
      return o;
    },
  };

  /* ---------- Время суток: цвет неба, солнца, тумана ---------- */
  // высота солнца, зенит, горизонт, туман, сияние у солнца, свет неба, свет от земли, свет солнца, экспозиция, фонари, ночь
  const KEYS = [
    [-0.32, '#04081a', '#141d38', '#0f1729', '#1a2644', ['#1c2a52', 0.9], ['#0c1120', 0.5], ['#9db4e8', 0.32], 2.1, 1, 1],
    [-0.1, '#16224a', '#5e4f78', '#454463', '#9a5a6a', ['#3a4878', 0.75], ['#221f2a', 0.5], ['#8090c8', 0.1], 1.9, 1, 0.8],
    [0.0, '#344f8c', '#ec9562', '#d0937c', '#ff9450', ['#6a76a6', 0.75], ['#5a3f38', 0.45], ['#ff8a48', 1.5], 1.3, 0.65, 0.4],
    [0.12, '#4677c0', '#f3c294', '#dcc2a6', '#ffcf88', ['#88a0cc', 0.85], ['#6a5640', 0.45], ['#ffc684', 2.5], 1.05, 0.12, 0.08],
    [0.4, '#2e6ccf', '#b8d2ec', '#c3d6e8', '#fff0d2', ['#9cbadf', 0.9], ['#6f6650', 0.42], ['#fff3e0', 2.7], 0.95, 0, 0],
  ].map((k) => ({ e: k[0], zen: lin(k[1]), hor: lin(k[2]), fog: lin(k[3]), glow: lin(k[4]), skyA: lin(k[5][0], k[5][1]), gndA: lin(k[6][0], k[6][1]), lc: lin(k[7][0], k[7][1]), exp: k[8], on: k[9], night: k[10] }));
  const MOON = lin('#9db4e8', 0.32);
  function palette(tod, storm) {
    const a = ((tod - 6) / 12) * Math.PI;
    const sun = norm3([Math.cos(a), Math.sin(a), 0.5]);
    const moon = norm3([-Math.cos(a) * 0.7, -Math.sin(a) * 0.85 + 0.25, -0.45]);
    const e = sun[1];
    let i = 0;
    while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const A = KEYS[i], B = KEYS[i + 1], k = clamp((e - A.e) / (B.e - A.e), 0, 1);
    const P = {};
    for (const key of ['zen', 'hor', 'fog', 'glow', 'skyA', 'gndA', 'lc']) P[key] = mixc(A[key], B[key], k);
    for (const key of ['exp', 'on', 'night']) P[key] = lerp(A[key], B[key], k);
    P.sun = sun;
    P.moon = moon;
    // днём светит солнце, ночью — луна; в сумерках свет плавно гаснет и загорается
    if (e > -0.04) {
      P.L = sun;
      if (e < 0.03) P.lc = mulc(P.lc, sstep(-0.04, 0.03, e));
    } else {
      P.L = moon;
      P.lc = mulc(MOON, sstep(-0.04, -0.2, e));
    }
    P.fogD = lerp(0.00026, 0.00013, sstep(-0.1, 0.25, e));
    P.cloud = 0.12;
    P.sunC = mixc(lin('#ff7a3a', 3), lin('#fff6e8', 4), sstep(0, 0.3, e));
    if (storm) {
      const gray = (c, k2) => {
        const l = (c[0] + c[1] + c[2]) / 3;
        return mulc(mixc(c, [l, l, l], 0.75), k2);
      };
      P.zen = gray(P.zen, 0.75);
      P.hor = gray(P.hor, 0.8);
      P.fog = gray(P.fog, 0.85);
      P.glow = gray(P.glow, 0.5);
      P.skyA = gray(P.skyA, 0.95);
      P.lc = mulc(P.lc, 0.3);
      P.fogD *= 2.4;
      P.cloud = 1;
      P.sunC = [0, 0, 0];
    }
    return P;
  }

  /* =========================================================
     4. ТЕМА «МИР КНИГИ»: отрисовка, кадры, управление
     ========================================================= */
  const SHOT_TOD = { overview: 17.7, street: 20.4, waterfall: 10.2, castle: 19.1, flight: 17.3, coast: 18.5, valley: 16.6 };
  const BOOK_TOD = { day: 13.5, dusk: 18.9, night: 23, storm: 14 };
  const MESH_OF = { conifer: 'conifer', broad: 'broad', poplar: 'poplar', ship: 'ship', sheep: 'sheep', cow: 'cow', deer: 'deer', cloud: 'cloud' };

  App.World3D = {
    on: false,
    world: null,
    srcHash: 0,
    timeMode: 'auto', // 'auto' — время под кадр; 'manual' — как выбрали
    todManual: 18.5,
    autoShots: true,
    mouse: { x: 0, y: 0, t: 0 },

    source() {
      const d = App.data;
      const parts = [];
      d.book.chapters.forEach((c) => parts.push(c.thesis, c.text));
      d.places.forEach((p) => parts.push([p.name, p.kind, p.desc, p.notes].join('. ')));
      return parts.join('\n');
    },

    sync() {
      const want = App.Theme.s.id === 'world';
      if (want && !this.on) this.start();
      else if (!want && this.on) this.stop();
      else if (want) this.kick();
    },

    start() {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'world-bg';
      document.body.prepend(this.canvas);
      const gl = this.canvas.getContext('webgl', { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: false });
      if (!gl) {
        this.canvas.remove();
        App.toast(t('world_nogl'), 'err');
        return;
      }
      this.gl = gl;
      this.inst = gl.getExtension('ANGLE_instanced_arrays');
      this.on = true;
      try {
        this.P = {
          sky: this.program(VS_FULL, FS_SKY),
          vox: this.program(VS_VOX, FS_VOX),
          obj: this.program(VS_OBJ, FS_OBJ),
          inst: this.program(VS_INST, FS_INST),
          water: this.program(VS_WATER, FS_WATER),
          fall: this.program(VS_FALL, FS_FALL),
          spr: this.program(VS_SPR, FS_SPR),
        };
      } catch (e) {
        console.error(e);
        this.stop();
        return;
      }
      this.B = { quad: this.buf(new Float32Array([-1, -1, 3, -1, -1, 3])) };
      // заготовки: позиция, нормаль, цвет (без «свечения»)
      const pm = protoMeshes();
      this.meshes = {};
      for (const k in pm) {
        const a = pm[k].a, out = new Float32Array((a.length / 10) * 9);
        for (let i = 0, j = 0; i < a.length; i += 10, j += 9) for (let q = 0; q < 9; q++) out[j + q] = a[i + q];
        this.meshes[k] = { b: this.buf(out), n: out.length / 9 };
      }
      this.onLost = (e) => {
        e.preventDefault();
        this.lost = true;
      };
      this.onRestored = () => {
        this.lost = false;
        this.stop();
        this.start();
      };
      this.canvas.addEventListener('webglcontextlost', this.onLost);
      this.canvas.addEventListener('webglcontextrestored', this.onRestored);
      this.onResize = () => {
        this.resize();
        this.kick();
      };
      window.addEventListener('resize', this.onResize);
      this.onVis = () => !document.hidden && this.kick();
      document.addEventListener('visibilitychange', this.onVis);
      // мышь: в фоне — лёгкий параллакс, в просмотре — руль полёта
      this.onMouse = (e) => {
        this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
        this.mouse.y = (e.clientY / innerHeight) * 2 - 1;
        this.mouse.t = performance.now();
      };
      window.addEventListener('pointermove', this.onMouse, { passive: true });
      this.srcHash = 0;
      this.shot = null;
      this.rebuild();
      this.resize();
      this.kick();
    },

    stop() {
      this.on = false;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('pointermove', this.onMouse);
      document.removeEventListener('visibilitychange', this.onVis);
      this.peek(false);
      if (this.gl) {
        const ext = this.gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext(); // сразу отдаём видеопамять, не ждём сборщика мусора
      }
      if (this.canvas) this.canvas.remove();
      this.gl = this.canvas = null;
      this.B = this.T = this.P = null;
      this.world = null;
    },

    buf(data, target, usage) {
      const gl = this.gl;
      const b = gl.createBuffer();
      gl.bindBuffer(target || gl.ARRAY_BUFFER, b);
      gl.bufferData(target || gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
      return b;
    },
    tex(w, h, data, filter) {
      const gl = this.gl;
      const tx = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tx;
    },

    program(vs, fs) {
      const gl = this.gl;
      const mk = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      const a = mk(gl.VERTEX_SHADER, vs), b = mk(gl.FRAGMENT_SHADER, fs);
      gl.attachShader(p, a);
      gl.attachShader(p, b);
      for (const k in ATTR) gl.bindAttribLocation(p, ATTR[k], k);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      gl.deleteShader(a);
      gl.deleteShader(b);
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
      }
      return { p, u };
    },

    // Разрешение ниже экранного: фон мягкий, а видеокарта отдыхает
    resize() {
      if (!this.canvas) return;
      const scale = this.peeking ? Math.min(devicePixelRatio || 1, 1.5) * 0.8 : 0.6;
      const w = Math.max(160, Math.round(innerWidth * scale)), h = Math.max(120, Math.round(innerHeight * scale));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
    },

    // Пересобрать мир, только если текст правда изменился
    rebuild(force) {
      if (!this.on) return;
      const src = this.source();
      const h = hashStr(src);
      if (h === this.srcHash && !force) return;
      this.srcHash = h;
      let w;
      try {
        w = buildWorld(analyze(src, App.data.places));
      } catch (e) {
        console.error('world', e);
        return;
      }
      const gl = this.gl, B = this.B;
      for (const k of ['voxD', 'voxF', 'obj', 'spr', 'water', 'falls', 'birds']) if (B[k]) gl.deleteBuffer(B[k]);
      for (const k in this.instB || {}) gl.deleteBuffer(this.instB[k]);
      if (this.T) for (const k in this.T) gl.deleteTexture(this.T[k]);
      B.voxD = this.buf(w.voxD.mesh);
      B.voxDN = w.voxD.mesh.length / 4;
      B.voxF = this.buf(w.voxF.mesh);
      B.voxFN = w.voxF.mesh.length / 4;
      B.obj = this.buf(w.objects);
      B.objN = w.objects.length / 10;
      B.spr = this.buf(w.sprites);
      B.sprN = w.sprites.length / 7;
      B.water = this.buf(w.water);
      B.waterN = w.water.length / 5;
      B.falls = this.buf(w.falls);
      B.fallsN = w.falls.length / 5;
      B.birds = this.buf(new Float32Array(10 * 6 * 80), gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
      this.instB = {};
      this.instN = {};
      for (const k in w.inst) {
        if (!w.inst[k].length) continue;
        this.instB[k] = this.buf(new Float32Array(w.inst[k]));
        this.instN[k] = w.inst[k].length / 8;
      }
      this.animalData = {};
      for (const k of ['sheep', 'cow', 'deer']) {
        const n = w.animals.filter((a) => a.type === k).length;
        if (!n) continue;
        this.animalData[k] = new Float32Array(n * 8);
        this.instB[k] = this.buf(this.animalData[k], gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
        this.instN[k] = n;
      }
      this.lightBuf = new Uint8Array(HT * HT * 4);
      this.T = {
        map: this.tex(TEX, TEX, w.map, gl.NEAREST),
        h: this.tex(HT, HT, w.hmap, gl.NEAREST),
        light: this.tex(HT, HT, this.lightBuf),
        top: this.tex(w.voxD.n, w.voxD.n, w.voxD.top, gl.NEAREST),
        side: this.tex(w.voxD.n, w.voxD.n, w.voxD.side, gl.NEAREST),
        ftop: this.tex(w.voxF.n, w.voxF.n, w.voxF.top, gl.NEAREST),
        fside: this.tex(w.voxF.n, w.voxF.n, w.voxF.side, gl.NEAREST),
      };
      this.shadowKey = null;
      this.world = w;
      this.facts = w.f;
      this.stats = w.stats;
      this.birds = [];
      this.shot = null;
      this.playlist = null;
      this.labelEls = null;
      this.renderPeek();
      this.kick();
    },

    // Тени от гор: идём по карте высот к солнцу (или луне)
    computeShadow(L) {
      const w = this.world;
      if (!w) return;
      const key = L.map((v) => v.toFixed(2)).join();
      if (key === this.shadowKey) return;
      this.shadowKey = key;
      const out = this.lightBuf, R0 = w.R, cell = (2 * R0) / HT;
      const hz = Math.hypot(L[0], L[2]) || 1e-6, dx = L[0] / hz, dz = L[2] / hz, tanE = L[1] / hz;
      const hgt = this.hgt || (this.hgt = new Float32Array(HT * HT));
      for (let q = 0; q < HT * HT; q++) hgt[q] = (w.hmap[q * 4] * 256 + w.hmap[q * 4 + 1]) / 100 - 200;
      const hAt = (x, z) => {
        const fi = (x + R0) / cell - 0.5, fj = (z + R0) / cell - 0.5;
        if (fi < 0 || fj < 0 || fi >= HT - 1 || fj >= HT - 1) return -1e3;
        const i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j;
        const p = j * HT + i;
        return lerp(lerp(hgt[p], hgt[p + 1], a), lerp(hgt[p + HT], hgt[p + HT + 1], a), b);
      };
      for (let j = 0; j < HT; j++)
        for (let i = 0; i < HT; i++) {
          const x = ((i + 0.5) / HT) * 2 * R0 - R0, z = ((j + 0.5) / HT) * 2 * R0 - R0;
          const h0 = hgt[j * HT + i] + 1.5;
          let s = 1;
          if (L[1] <= 0.01) s = 0;
          else {
            let tt = 6;
            for (let k = 0; k < 44 && s > 0.02; k++) {
              const rh = h0 + tt * tanE;
              if (rh > 520) break;
              const th = hAt(x + dx * tt, z + dz * tt);
              if (th < -900) break;
              s = Math.min(s, clamp((rh - th) / (tt * 0.035 + 1.5) + 0.5, 0, 1));
              tt += 6 + tt * 0.09;
            }
          }
          const q = (j * HT + i) * 4;
          out[q] = Math.round(s * 255);
          out[q + 1] = Math.round(clamp(w.pool[j * HT + i], 0, 1) * 255);
        }
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.T.light);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, HT, HT, gl.RGBA, gl.UNSIGNED_BYTE, out);
    },

    schedule() {
      if (!this.on) return;
      clearTimeout(this.rt);
      // Пересборка — через 4 с после последней правки и когда браузер свободен
      this.rt = setTimeout(() => (window.requestIdleCallback || setTimeout)(() => this.rebuild(), { timeout: 2000 }), 4000);
    },
    kick() {
      if (!this.on || this.raf) return;
      this.raf = requestAnimationFrame((ts) => this.frame(ts));
    },
    frame(ts) {
      this.raf = 0;
      if (!this.on || document.hidden || this.lost) return; // вкладка в фоне — ничего не рисуем
      const motion = (App.Theme.s.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches) || this.peeking;
      const typing = Date.now() - (this.typedAt || 0) < 1500;
      const fps = this.peeking ? 60 : typing ? 6 : 24;
      if (!this.drawnOnce || ts - (this.last || 0) >= 1000 / fps - 2) {
        const dt = clamp((ts - (this.last || ts)) / 1000, 0, 0.1);
        this.last = ts;
        this.still = !motion;
        if (motion) this.time = (this.time || 0) + dt;
        else if (this.time == null) this.time = 30;
        this.draw(motion ? dt : 0);
        this.drawnOnce = true;
      }
      if (motion) this.kick();
    },

    /* ---------- Кадры ---------- */
    available() {
      if (!this.playlist) {
        const s = this.world.shots;
        const list = ['overview'];
        if (s.street.length) list.push('street');
        if (s.fall) list.push('waterfall');
        if (s.castles.length) list.push('castle');
        list.push('flight');
        if (s.coast) list.push('coast');
        if (s.fields.length) list.push('valley');
        this.playlist = list;
        this.pi = -1;
      }
      return this.playlist;
    },
    nextShot() {
      const list = this.available();
      this.pi = (this.pi + 1) % list.length;
      return list[this.pi];
    },
    setShot(type, keepAuto) {
      if (!this.world) return;
      if (!keepAuto) this.autoShots = false;
      this.fadeTo = { type, t: 0 };
      const list = this.available();
      if (list.includes(type)) this.pi = list.indexOf(type);
      this.renderPeekControls();
    },
    startShot(type) {
      const w = this.world, s = w.shots, rnd = Math.random;
      const sh = { type, t: 0, dur: type === 'flight' ? 26 : 15 };
      if (type === 'street' && s.street.length) {
        const st = s.street[Math.floor(rnd() * s.street.length)];
        const dir = rnd() < 0.5 ? 1 : -1;
        sh.a = dir > 0 ? [st.ax, st.az] : [st.bx, st.bz];
        sh.d = [st.d[0] * dir, st.d[1] * dir];
        sh.off = (rnd() - 0.5) * 2;
        sh.len = Math.hypot(st.bx - st.ax, st.bz - st.az);
      } else if (type === 'waterfall' && s.fall) {
        sh.side = rnd() < 0.5 ? 1 : -1;
      } else if (type === 'castle' && s.castles.length) {
        sh.c = s.castles[Math.floor(rnd() * s.castles.length)];
        sh.a0 = rnd() * 6.28;
      } else if (type === 'coast' && s.coast) {
        sh.c = s.coast;
        sh.a0 = rnd() * 6.28;
      } else if (type === 'valley' && s.fields.length) {
        const fa = s.fields[Math.floor(rnd() * s.fields.length)];
        sh.tgt = fa.home;
        const a = Math.atan2(fa.z - fa.home.z, fa.x - fa.home.x);
        sh.start = [fa.home.x + Math.cos(a) * (fa.home.r + 330), fa.home.z + Math.sin(a) * (fa.home.r + 330)];
      } else if (type === 'flight') {
        const p = w.pois[Math.floor(rnd() * w.pois.length)];
        const a = rnd() * 6.28;
        this.fly = { x: clamp(p.x - Math.cos(a) * 500, -w.R * 0.8, w.R * 0.8), z: clamp(p.z - Math.sin(a) * 500, -w.R * 0.8, w.R * 0.8), yaw: a, alt: 110, y: null, speed: 26, poi: Math.floor(rnd() * 9), pitch: -0.32 };
        // в окне просмотра полёт длится, пока не выберете другой кадр
        if (this.peeking && !this.autoShots) sh.dur = 1e9;
      } else if (type !== 'overview') return this.startShot('overview');
      if (type === 'overview') sh.a0 = rnd() * 6.28;
      this.shot = sh;
      this.shadowAt = 0; // время суток могло прыгнуть — тени сразу заново
      this.birds = [];
      this.renderPeekControls();
    },
    // Камера кадра: глаз, куда смотрим, угол обзора
    camera(dt) {
      const w = this.world, s = w.shots, sh = this.shot, g = w.ground;
      const T = sh.t;
      let eye, look, fov = 0.95, near = 2, far = 15000;
      if (sh.type === 'street') {
        const p = Math.min(sh.len - 30, 6 + T * 1.5);
        const nx = -sh.d[1], nz = sh.d[0];
        const x = sh.a[0] + sh.d[0] * p + nx * sh.off, z = sh.a[1] + sh.d[1] * p + nz * sh.off;
        const y = g(x, z) + 1.75 + Math.sin(T * 4.2) * 0.03;
        eye = [x, y, z];
        look = [x + sh.d[0] * 30 + nx * Math.sin(T * 0.2) * 2, y + 1.2, z + sh.d[1] * 30 + nz * Math.sin(T * 0.2) * 2];
        fov = 1.08;
        near = 0.3;
        far = 6000;
      } else if (sh.type === 'waterfall') {
        const f = s.fall, nx = -f.dz, nz = f.dx;
        const back = 62 - T * 0.9, lat = sh.side * (14 + Math.sin(T * 0.12) * 6);
        const x = f.pool.x + f.dx * back + nx * lat, z = f.pool.z + f.dz * back + nz * lat;
        eye = [x, Math.max(g(x, z), f.bot) + 3.2, z];
        look = [f.x, (f.top + f.bot) / 2 + 2, f.z];
        fov = 1.0;
        near = 0.5;
        far = 8000;
      } else if (sh.type === 'castle') {
        const c = sh.c, a = sh.a0 + T * 0.045, r = 175 - T * 2;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        eye = [x, Math.max(g(x, z) + 12, c.h + 38), z];
        look = [c.x, c.h + 14, c.z];
        fov = 0.85;
      } else if (sh.type === 'coast') {
        const c = sh.c, a = sh.a0 + T * 0.03;
        const x = c.x + Math.cos(a) * 140, z = c.z + Math.sin(a) * 140;
        eye = [x, Math.max(g(x, z), 0) + 16, z];
        const Lh = s.lighthouse;
        look = Lh ? [Lh.x, g(Lh.x, Lh.z) + 18, Lh.z] : [c.x, 4, c.z];
        fov = 0.9;
      } else if (sh.type === 'valley') {
        const tg = sh.tgt;
        const k = Math.min(1, T / 22);
        const x = lerp(sh.start[0], tg.x, k * 0.75), z = lerp(sh.start[1], tg.z, k * 0.75);
        eye = [x, g(x, z) + 22 + Math.sin(T * 0.3) * 3, z];
        look = [tg.x, tg.h + 8, tg.z];
        fov = 0.9;
      } else if (sh.type === 'flight') {
        const F = this.fly, m = this.mouse;
        const steer = this.peeking && performance.now() - m.t < 4000;
        if (steer) {
          // мышь правит: влево-вправо — поворот, вверх-вниз — нос камеры и высота
          F.yaw += m.x * 1.1 * dt;
          F.pitch = lerp(F.pitch, -0.3 - m.y * 0.45, Math.min(1, dt * 2));
          F.alt = clamp(F.alt - m.y * 60 * dt, 25, 700);
        } else {
          const p = w.pois[F.poi % w.pois.length];
          let da = Math.atan2(p.z - F.z, p.x - F.x) - F.yaw;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          F.yaw += clamp(da, -1, 1) * dt * 0.22;
          if (Math.hypot(p.x - F.x, p.z - F.z) < 120) F.poi++;
          F.pitch = lerp(F.pitch, -0.3, Math.min(1, dt));
        }
        // не улетать за край подробной земли
        if (Math.hypot(F.x, F.z) > w.R * 0.85) {
          let da = Math.atan2(-F.z, -F.x) - F.yaw;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          F.yaw += da * dt * 0.8;
        }
        F.x += Math.cos(F.yaw) * F.speed * dt;
        F.z += Math.sin(F.yaw) * F.speed * dt;
        let gh = 0;
        for (const d of [0, 40, 90, 160]) gh = Math.max(gh, g(F.x + Math.cos(F.yaw) * d, F.z + Math.sin(F.yaw) * d));
        const ty = gh + F.alt;
        F.y = F.y == null ? ty : lerp(F.y, ty, Math.min(1, dt * 0.9));
        eye = [F.x, F.y, F.z];
        const cp = Math.cos(F.pitch);
        look = [F.x + Math.cos(F.yaw) * cp * 100, F.y + Math.sin(F.pitch) * 100, F.z + Math.sin(F.yaw) * cp * 100];
        fov = 1.0;
        near = 3;
      } else {
        // обзор: высоко над долиной, горы — в глубине кадра, солнце сбоку
        const mt = w.labels.find((l) => l.type === 'mountain');
        const c = w.pois[0];
        let dir = mt ? [mt.x - c.x * 0.3, mt.z - c.z * 0.3] : [Math.cos(sh.a0), Math.sin(sh.a0)];
        const dl = Math.hypot(dir[0], dir[1]) || 1;
        dir = [dir[0] / dl, dir[1] / dl];
        const sway = Math.sin(sh.a0 + T * 0.035) * 0.35 + (sh.a0 > 3.14 ? 0.25 : -0.25);
        const cs = Math.cos(sway), sn = Math.sin(sway);
        const d2 = [dir[0] * cs - dir[1] * sn, dir[0] * sn + dir[1] * cs];
        const x = c.x * 0.3 - d2[0] * (900 - T * 6), z = c.z * 0.3 - d2[1] * (900 - T * 6);
        eye = [x, Math.max(g(x, z) + 200, 360), z];
        look = [x + d2[0] * 1600, 60, z + d2[1] * 1600];
        near = 4;
      }
      // параллакс за мышью (в фоне — едва заметный)
      if (!(sh.type === 'flight' && this.peeking)) {
        const k = this.peeking ? 0.12 : 0.035, m = this.mouse;
        this.par = this.par || [0, 0];
        this.par[0] = lerp(this.par[0], m.x * k, Math.min(1, dt * 2));
        this.par[1] = lerp(this.par[1], -m.y * k * 0.6, Math.min(1, dt * 2));
        const fw = norm3(sub3(look, eye)), side = norm3(cross(fw, [0, 1, 0]));
        const d = Math.hypot(...sub3(look, eye));
        look = [look[0] + side[0] * this.par[0] * d, look[1] + this.par[1] * d, look[2] + side[2] * this.par[0] * d];
      }
      return { eye, look, fov, near, far };
    },

    // Время суток
    tod() {
      if (this.timeMode === 'manual') return this.todManual;
      const sh = this.shot;
      const book = BOOK_TOD[this.facts.time] || 13.5;
      let v = (sh && SHOT_TOD[sh.type]) || book;
      // ночная книга — крепость и побережье ночью; остальное — в золотой час
      if (this.facts.time === 'night' && sh && (sh.type === 'castle' || sh.type === 'coast')) v = 21.4;
      // медленно течёт внутри кадра
      return (v + (sh ? Math.min(sh.t, 60) : 0) * 0.012 + 24) % 24;
    },

    /* ---------- Животные и птицы ---------- */
    updateFauna(dt, P, eye) {
      const w = this.world, gl = this.gl;
      const night = P.night > 0.6;
      const per = {};
      for (const a of w.animals) {
        if (!night) {
          a.wait -= dt;
          if (a.wait <= 0) {
            const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
            if (d < 0.5) {
              // постоять, пощипать траву, потом новая точка
              const ang = Math.random() * 6.28, rr = Math.random() * a.hr;
              a.tx = a.hx + Math.cos(ang) * rr;
              a.tz = a.hz + Math.sin(ang) * rr;
              a.wait = 2 + Math.random() * 7;
              a.moving = false;
            } else {
              let da = Math.atan2(dz, dx) - a.yaw;
              da = Math.atan2(Math.sin(da), Math.cos(da));
              a.yaw += clamp(da, -2 * dt, 2 * dt);
              const st = Math.min(d, a.sp * dt);
              a.x += Math.cos(a.yaw) * st;
              a.z += Math.sin(a.yaw) * st;
              a.moving = true;
            }
          }
        } else a.moving = false;
        const arr = this.animalData[a.type];
        const i = (per[a.type] = (per[a.type] || 0) + 1) - 1;
        arr[i * 8] = a.x;
        arr[i * 8 + 1] = w.ground(a.x, a.z) - 0.05;
        arr[i * 8 + 2] = a.z;
        arr[i * 8 + 3] = a.type === 'cow' ? 1 : 1.1;
        arr[i * 8 + 4] = a.yaw;
        arr[i * 8 + 5] = 0;
        arr[i * 8 + 6] = a.moving ? 1 : 0;
        arr[i * 8 + 7] = -1;
      }
      for (const k in this.animalData) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instB[k]);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.animalData[k]);
      }
      // Стайки птиц пролетают в кадре
      const B = this.birds;
      if (P.night < 0.7 && dt > 0) {
        while (B.length < 2) {
          const fw = norm3(sub3(this.cam.look, eye));
          const d = 90 + Math.random() * 220;
          const side = norm3(cross(fw, [0, 1, 0]));
          const sgn = Math.random() < 0.5 ? 1 : -1;
          const gx = eye[0] + fw[0] * d, gz = eye[2] + fw[2] * d;
          const c = [gx - side[0] * sgn * 260, Math.max(eye[1] + (Math.random() - 0.2) * 40, w.ground(gx, gz) + 25), gz - side[2] * sgn * 260];
          const sp = 9 + Math.random() * 5;
          const v = [side[0] * sgn * sp, 0, side[2] * sgn * sp];
          const n = 6 + Math.floor(Math.random() * 10);
          const gull = w.coastal && Math.random() < 0.6;
          const off = [];
          for (let i = 0; i < n; i++) off.push([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 30, Math.random() * 6]);
          B.push({ c, v, off, life: 0, col: gull ? lin('#e8e8e4') : lin('#24262c'), span: gull ? 1.6 : 1.1 });
        }
      }
      const out = [];
      for (let k = B.length - 1; k >= 0; k--) {
        const b = B[k];
        b.life += dt;
        b.c[0] += b.v[0] * dt;
        b.c[2] += b.v[2] * dt;
        b.c[1] += Math.sin(b.life * 0.5) * 0.4 * dt;
        if (b.life > 40 || P.night > 0.85) {
          B.splice(k, 1);
          continue;
        }
        const h = norm3(b.v), s = [-h[2], 0, h[0]];
        for (const o of b.off) {
          if (out.length >= 80 * 60) break;
          const p = [b.c[0] + o[0] + Math.sin(this.time * 0.7 + o[3]) * 2, b.c[1] + o[1], b.c[2] + o[2] + Math.cos(this.time * 0.6 + o[3]) * 2];
          const fl = Math.sin(this.time * 9 + o[3]) * 0.9;
          const sp = b.span;
          const nose = [p[0] + h[0] * 0.5, p[1], p[2] + h[2] * 0.5], tail = [p[0] - h[0] * 0.4, p[1], p[2] - h[2] * 0.4];
          for (const sg of [1, -1]) {
            const tip = [p[0] + s[0] * sg * sp - h[0] * 0.3, p[1] + fl * sp * 0.6, p[2] + s[2] * sg * sp - h[2] * 0.3];
            for (const q of [nose, tail, tip]) out.push(q[0], q[1], q[2], 0, 1, 0, b.col[0], b.col[1], b.col[2], 0);
          }
        }
      }
      this.birdN = out.length / 10;
      if (this.birdN) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.B.birds);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(out));
      }
    },

    /* ---------- Кадр ---------- */
    draw(dt) {
      const gl = this.gl, w = this.world;
      if (!gl || !w) return;
      // кадры сменяются через затемнение
      if (!this.shot) this.startShot(this.peeking && !this.autoShots ? 'flight' : this.nextShot());
      let sh = this.shot;
      sh.t += dt;
      let fade = Math.min(1, sh.t / 1.2);
      if (this.fadeTo) {
        this.fadeTo.t += dt;
        fade = Math.min(fade, 1 - this.fadeTo.t / 0.6);
        if (this.fadeTo.t >= 0.6) {
          const ty = this.fadeTo.type;
          this.fadeTo = null;
          this.startShot(ty);
          fade = 0;
        }
      } else if (sh.t > sh.dur - 1.2 && (this.autoShots || !this.peeking)) {
        fade = Math.min(fade, (sh.dur - sh.t) / 1.2);
        if (sh.t >= sh.dur) {
          this.startShot(this.nextShot());
          fade = 0;
        }
      }
      sh = this.shot;
      if (this.still) fade = 1;
      fade = clamp(fade, 0, 1);
      const P = palette(this.tod(), this.facts.time === 'storm');
      this.pal = P;
      // тени пересчитываем, когда свет сдвинулся (не чаще раза в 1,5 с)
      const now = performance.now();
      if (!this.shadowAt || now - this.shadowAt > 1500) {
        this.computeShadow(P.L);
        this.shadowAt = now;
      }
      const W = this.canvas.width, H = this.canvas.height, ar = W / H;
      const cam = this.camera(dt);
      this.cam = cam;
      const proj = M4.persp(cam.fov, ar, cam.near, cam.far);
      const vp = M4.mul(proj, M4.look(cam.eye, cam.look, [0, 1, 0]));
      this.vp = vp;
      this.updateFauna(dt, P, cam.eye);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const inst = this.inst;
      const enabled = [];
      const attrs = (buf, stride, list, divisor) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        for (const [loc, size, off] of list) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
          if (divisor && inst) inst.vertexAttribDivisorANGLE(loc, 1);
          enabled.push(loc);
        }
      };
      const reset = () => {
        while (enabled.length) {
          const l = enabled.pop();
          gl.disableVertexAttribArray(l);
          if (inst && l >= 4) inst.vertexAttribDivisorANGLE(l, 0);
        }
      };
      const vpF = new Float32Array(vp);
      const common = (p) => {
        const u = p.u;
        gl.useProgram(p.p);
        if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, vpF);
        gl.uniform3fv(u.uEye, cam.eye);
        gl.uniform3fv(u.uL, P.L);
        gl.uniform3fv(u.uLCol, P.lc);
        gl.uniform3fv(u.uSkyA, P.skyA);
        gl.uniform3fv(u.uGndA, P.gndA);
        gl.uniform3fv(u.uFogC, P.fog);
        gl.uniform3fv(u.uGlow, P.glow);
        gl.uniform1f(u.uFogD, P.fogD);
        gl.uniform1f(u.uNight, P.night);
        gl.uniform1f(u.uTime, this.time);
        gl.uniform1f(u.uExp, P.exp);
        gl.uniform3fv(u.uZen, P.zen);
        gl.uniform3fv(u.uHor, P.hor);
        gl.uniform3fv(u.uSunD, P.sun);
        gl.uniform1f(u.uOn, P.on);
        gl.uniform1f(u.uR, w.R);
        gl.uniform1f(u.uFade, fade);
        gl.uniform1f(u.uPoolK, 0.6);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.T.light);
        gl.uniform1i(u.uLight, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.T.map);
        gl.uniform1i(u.uMap, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.T.h);
        gl.uniform1i(u.uH, 2);
        return u;
      };
      // Небо
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      let u = common(this.P.sky);
      const fwd = norm3(sub3(cam.look, cam.eye)), right = norm3(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
      gl.uniform3fv(u.uCF, fwd);
      gl.uniform3fv(u.uCR, right);
      gl.uniform3fv(u.uCU, up);
      gl.uniform2f(u.uTan, Math.tan(cam.fov / 2) * ar, Math.tan(cam.fov / 2));
      gl.uniform3fv(u.uMoonD, P.moon);
      gl.uniform1f(u.uCloud, P.cloud);
      gl.uniform3fv(u.uSunC, P.sunC);
      attrs(this.B.quad, 0, [[0, 2, 0]]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      reset();
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
      // Земля из кубиков: сначала дальние горы, потом подробная часть
      u = common(this.P.vox);
      for (const [buf, n, V, top, side, det] of [[this.B.voxF, this.B.voxFN, w.voxF, this.T.ftop, this.T.fside, 0], [this.B.voxD, this.B.voxDN, w.voxD, this.T.top, this.T.side, 1]]) {
        gl.uniform3f(u.uOrg, V.org, 0, V.org);
        gl.uniform3f(u.uScale, V.cw, V.vy, V.cw);
        gl.uniform1f(u.uCells, V.n);
        gl.uniform1f(u.uDetail, det);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, top);
        gl.uniform1i(u.uTop, 3);
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, side);
        gl.uniform1i(u.uSide, 4);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.SHORT, false, 8, 0);
        gl.drawArrays(gl.TRIANGLES, 0, n);
        gl.disableVertexAttribArray(0);
      }
      // Постройки и птицы
      u = common(this.P.obj);
      gl.uniform1f(u.uPoolK, 0.3);
      attrs(this.B.obj, 40, [[0, 3, 0], [1, 3, 12], [2, 3, 24], [3, 1, 36]]);
      gl.drawArrays(gl.TRIANGLES, 0, this.B.objN);
      reset();
      if (this.birdN) {
        attrs(this.B.birds, 40, [[0, 3, 0], [1, 3, 12], [2, 3, 24], [3, 1, 36]]);
        gl.drawArrays(gl.TRIANGLES, 0, this.birdN);
        reset();
      }
      // Деревья, животные, лодки — одна модель, много копий
      if (inst) {
        u = common(this.P.inst);
        gl.uniform1f(u.uPoolK, 0.5);
        for (const k in this.instB) {
          const mesh = this.meshes[MESH_OF[k]];
          if (!mesh || !this.instN[k]) continue;
          attrs(mesh.b, 36, [[0, 3, 0], [1, 3, 12], [2, 3, 24]]);
          attrs(this.instB[k], 32, [[4, 4, 0], [5, 4, 16]], true);
          inst.drawArraysInstancedANGLE(gl.TRIANGLES, 0, mesh.n, this.instN[k]);
          reset();
        }
      }
      // Вода и водопад — полупрозрачные
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      u = common(this.P.water);
      gl.uniform3fv(u.uDeep, w.coastal ? lin('#0a2a3a') : lin('#0e2a26'));
      gl.uniform3fv(u.uShal, lin('#2f8a86'));
      attrs(this.B.water, 20, [[0, 3, 0], [3, 2, 12]]);
      gl.drawArrays(gl.TRIANGLES, 0, this.B.waterN);
      reset();
      gl.depthMask(false);
      if (this.B.fallsN) {
        common(this.P.fall);
        attrs(this.B.falls, 20, [[0, 3, 0], [3, 2, 12]]);
        gl.drawArrays(gl.TRIANGLES, 0, this.B.fallsN);
        reset();
      }
      // Огни, светлячки, брызги — свет складывается
      gl.blendFunc(gl.ONE, gl.ONE);
      u = common(this.P.spr);
      gl.uniform1f(u.uPx, H / (2 * Math.tan(cam.fov / 2)));
      attrs(this.B.spr, 28, [[0, 3, 0], [3, 4, 12]]);
      gl.drawArrays(gl.POINTS, 0, this.B.sprN);
      reset();
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      if (this.peeking) {
        this.placeLabels();
        this.updateClock();
      }
    },

    /* --- «Посмотреть мир»: интерфейс прячется, мир на весь экран --- */
    peek(on) {
      this.peeking = !!on;
      document.documentElement.classList.toggle('world-peek', this.peeking);
      if (!this.peekEl) {
        if (!on) return;
        this.peekEl = App.el(`<div class="world-peek-ui"><div class="wp-labels"></div><div class="wp-hint-top"></div><div class="wp-card"></div></div>`);
        document.body.appendChild(this.peekEl);
        this.peekEl.addEventListener('click', (e) => {
          const b = e.target.closest('[data-wp]');
          if (!b) return;
          const a = b.dataset.wp;
          if (a === 'close') this.peek(false);
          else if (a === 'rebuild') this.rebuild(true);
          else if (a === 'auto') {
            this.autoShots = !this.autoShots;
            if (this.autoShots && this.shot) this.shot.dur = Math.min(this.shot.dur, this.shot.t + 8);
            this.renderPeekControls();
          } else if (a === 'shot') this.setShot(b.dataset.s);
          else if (a === 'tauto') {
            this.timeMode = this.timeMode === 'auto' ? 'manual' : 'auto';
            if (this.timeMode === 'manual') this.todManual = this.tod();
            this.renderPeekControls();
          } else if (a === 'min') this.peekEl.classList.toggle('wp-min');
        });
        this.peekEl.addEventListener('input', (e) => {
          if (!e.target.matches('.wp-time')) return;
          this.timeMode = 'manual';
          this.todManual = +e.target.value;
          this.shadowAt = 0;
          this.renderPeekControls(true);
        });
        this.peekEl.addEventListener(
          'wheel',
          (e) => {
            if (e.target.closest('.wp-card') || !this.fly) return;
            this.fly.alt = clamp(this.fly.alt + e.deltaY * 0.25, 25, 700);
            this.mouse.t = performance.now();
          },
          { passive: true }
        );
        this.onKey = (e) => e.key === 'Escape' && this.peeking && this.peek(false);
        document.addEventListener('keydown', this.onKey);
      }
      this.peekEl.classList.toggle('hidden', !this.peeking);
      if (on) {
        this.autoShots = false;
        this.setShot('flight', true);
      } else {
        this.autoShots = true;
        if (this.shot && this.shot.dur > 1e6) this.shot.dur = this.shot.t + 6;
      }
      this.resize();
      this.renderPeek();
      this.kick();
    },

    renderPeek() {
      if (!this.peeking || !this.peekEl || !this.facts) return;
      const f = this.facts, ru = App.lang !== 'en';
      const FN = FNAME[ru ? 'ru' : 'en'];
      const w = this.world;
      // Что сайт понял: каждый пункт — с цитатой из книги
      const items = [];
      const seen = new Set();
      const push = (type, where, name, quote) => {
        const k = type + '|' + (name || where || '');
        if (seen.has(k)) return;
        seen.add(k);
        items.push(`<li><span class="wp-it">${ICON[type] || '•'}</span><div><b>${App.esc(name || FN[type] || type)}</b>${name && FN[type] ? ` <span class="wp-ty">${FN[type]}</span>` : ''}${where ? ` <span class="wp-where">— ${where}</span>` : ''}${quote ? `<q>${App.esc(quote)}</q>` : ''}</div></li>`);
      };
      const whereOf = (x, z) => (Math.hypot(x, z) > w.R * 0.3 ? DIRNAME({ x: x / w.R, y: z / w.R }) : DIRNAME({ x: 0, y: 0 }));
      if (w) {
        for (const s of w.S) push(s.type, whereOf(s.x, s.z), s.name, s.quote);
        for (const l of w.labels) if (['wall', 'waterfall', 'mountain'].includes(l.type)) push(l.type, whereOf(l.x, l.z), l.name, l.quote);
      }
      for (const k of ['sea', 'forest', 'river', 'lake', 'hills', 'snow', 'desert', 'swamp', 'plain', 'island', 'volcano', 'animals', 'birds'])
        if (f.cnt[k]) push(k, f.dir[k] && Math.hypot(f.dir[k].x, f.dir[k].y) > 0.3 ? DIRNAME(f.dir[k]) : '', '', (f.quotes[k] || [])[0]);
      const st = this.stats || {};
      this.peekEl.querySelector('.wp-hint-top').textContent = t('world_hint_fly');
      this.peekEl.querySelector('.wp-card').innerHTML = `
        <div class="wp-head"><span class="wp-ic">${App.icon('globe')}</span><div style="flex:1"><div class="wp-title">${t('world_title')}</div>
          <div class="wp-mode">${t('world_mode_live')} · ${t('world_time_' + f.time)}</div></div>
          <button class="icon-btn sm wp-minb" data-wp="min" title="${t('world_min')}">${App.icon('down')}</button></div>
        <div class="wp-body">
          <div class="wp-lbl">${t('world_shots')}</div><div class="wp-shots"></div>
          <div class="wp-lbl">${t('world_time')}</div>
          <div class="wp-timerow"><input type="range" class="wp-time" min="0" max="24" step="0.05"><span class="wp-clock"></span>
            <button class="wp-chip2" data-wp="tauto"></button></div>
          <details class="wp-understood" ${this.openUnderstood ? 'open' : ''}><summary>${t('world_understood', { n: items.length })}</summary>
            ${items.length ? `<ul class="wp-list">${items.join('')}</ul>` : `<div class="wp-empty">${t('world_nothing')}</div>`}
          </details>
          <div class="wp-stats">${t('world_stats2', { ms: st.ms || 0, trees: App.fmt(st.trees || 0), houses: App.fmt(st.houses || 0) })}</div>
          <div class="wp-btns"><button class="btn sm" data-wp="rebuild">${App.icon('reset')}${t('world_rebuild')}</button><button class="btn sm primary" data-wp="close">${t('close')}</button></div>
        </div>`;
      const det = this.peekEl.querySelector('.wp-understood');
      det.addEventListener('toggle', () => (this.openUnderstood = det.open));
      this.labelEls = null;
      this.shownShot = null;
      this.renderPeekControls();
    },
    renderPeekControls(fromSlider) {
      if (!this.peekEl || !this.world || !this.facts) return;
      const box = this.peekEl.querySelector('.wp-shots');
      if (!box) return;
      const cur = this.fadeTo ? this.fadeTo.type : this.shot && this.shot.type;
      box.innerHTML =
        this.available().map((s) => `<button class="wp-chip2 ${s === cur ? 'on' : ''}" data-wp="shot" data-s="${s}">${t('world_shot_' + s)}</button>`).join('') +
        `<button class="wp-chip2 wp-auto ${this.autoShots ? 'on' : ''}" data-wp="auto">${App.icon(this.autoShots ? 'pause' : 'play')}${t('world_auto')}</button>`;
      const ta = this.peekEl.querySelector('[data-wp="tauto"]');
      ta.textContent = t(this.timeMode === 'auto' ? 'world_time_auto' : 'world_time_manual');
      ta.classList.toggle('on', this.timeMode === 'auto');
      if (!fromSlider) this.peekEl.querySelector('.wp-time').value = this.tod();
      this.shownShot = cur;
      this.updateClock();
    },
    updateClock() {
      const el = this.peekEl && this.peekEl.querySelector('.wp-clock');
      if (!el || !this.facts) return;
      const v = this.tod();
      const txt = String(Math.floor(v)).padStart(2, '0') + ':' + String(Math.floor((v % 1) * 60)).padStart(2, '0');
      if (el.textContent !== txt) el.textContent = txt;
      if (this.timeMode === 'auto') {
        const s = this.peekEl.querySelector('.wp-time');
        if (s && document.activeElement !== s) s.value = v;
      }
      const cur = this.fadeTo ? this.fadeTo.type : this.shot && this.shot.type;
      if (cur !== this.shownShot) {
        this.shownShot = cur;
        this.peekEl.querySelectorAll('[data-wp="shot"]').forEach((b) => b.classList.toggle('on', b.dataset.s === cur));
      }
    },

    // Подписи мест: координаты мира → пиксели экрана
    placeLabels() {
      const w = this.world;
      const box = this.peekEl && this.peekEl.querySelector('.wp-labels');
      if (!box || !w) return;
      const FN = FNAME[App.lang !== 'en' ? 'ru' : 'en'];
      const items = w.labels;
      if (!this.labelEls || this.labelEls.length !== items.length) {
        box.innerHTML = items.map((m) => `<span class="wl">${ICON[m.type] || ''} ${App.esc(m.name || FN[m.type] || '')}</span>`).join('');
        this.labelEls = [...box.children];
      }
      const Wd = innerWidth, Hd = innerHeight, v = this.vp, e = this.cam.eye;
      items.forEach((m, i) => {
        const cx = v[0] * m.x + v[4] * m.y + v[8] * m.z + v[12];
        const cy = v[1] * m.x + v[5] * m.y + v[9] * m.z + v[13];
        const cw = v[3] * m.x + v[7] * m.y + v[11] * m.z + v[15];
        const x = ((cx / cw) * 0.5 + 0.5) * Wd, y = (1 - ((cy / cw) * 0.5 + 0.5)) * Hd;
        const d = Math.hypot(m.x - e[0], m.z - e[2]);
        const el = this.labelEls[i];
        el.style.transform = `translate(${x | 0}px, ${y | 0}px) translate(-50%, -100%)`;
        el.style.opacity = cw > 0 && x > 0 && x < Wd && y > 0 && y < Hd && d < 2600 && d > 60 ? clamp(1.3 - d / 2600, 0.35, 1) : 0;
      });
    },

    init() {
      App.on('typing', () => {
        this.typedAt = Date.now();
        this.schedule();
      });
      App.on('text-changed', () => this.schedule());
      App.on('data-reset', () => {
        this.srcHash = 0;
        this.schedule();
      });
      App.on('lang', () => {
        this.labelEls = null;
        this.renderPeek();
      });
      this.sync();
    },

    // Для проверки из консоли: что сайт понял из любого текста
    _analyze: analyze,
    _build: (txt) => buildWorld(analyze(txt, [])),
  };

  const FNAME = {
    ru: { sea: 'море', island: 'остров', mountain: 'горы', volcano: 'вулкан', hills: 'холмы', forest: 'лес', desert: 'пустыня', snow: 'снег и лёд', river: 'река', waterfall: 'водопад', lake: 'озеро', swamp: 'болото', plain: 'поля и луга', city: 'город', village: 'деревня', lighthouse: 'маяк', castle: 'крепость', wall: 'стена', tower: 'башня', house: 'дом', bridge: 'мост', road: 'дорога', temple: 'храм', ship: 'корабль', animals: 'животные', birds: 'птицы', continent: 'материк' },
    en: { sea: 'sea', island: 'island', mountain: 'mountains', volcano: 'volcano', hills: 'hills', forest: 'forest', desert: 'desert', snow: 'snow and ice', river: 'river', waterfall: 'waterfall', lake: 'lake', swamp: 'swamp', plain: 'fields and meadows', city: 'city', village: 'village', lighthouse: 'lighthouse', castle: 'fortress', wall: 'wall', tower: 'tower', house: 'house', bridge: 'bridge', road: 'road', temple: 'temple', ship: 'ship', animals: 'animals', birds: 'birds', continent: 'continent' },
  };
  const ICON = { sea: '🌊', island: '🏝', mountain: '⛰', volcano: '🌋', hills: '🌄', forest: '🌲', desert: '🏜', snow: '❄', river: '〰', waterfall: '💧', lake: '💧', swamp: '🌾', plain: '🌾', city: '🏘', village: '🏡', lighthouse: '🗼', castle: '🏰', wall: '🧱', tower: '🗼', temple: '⛪', animals: '🦌', birds: '🕊' };
  const DIRNAME = (d) => {
    const ru = App.lang !== 'en';
    if (Math.hypot(d.x, d.y) < 0.3) return ru ? 'в центре' : 'in the center';
    const a = Math.atan2(d.y, d.x), k = Math.round(a / (Math.PI / 4));
    const names = ru ? ['на востоке', 'на юго-востоке', 'на юге', 'на юго-западе', 'на западе', 'на северо-западе', 'на севере', 'на северо-востоке'] : ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    return names[(k + 8) % 8];
  };
})();
