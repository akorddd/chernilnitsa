'use strict';
/* =========================================================
   «Мир книги» — тема, которую рисует сам сайт.
   1) Читаем книгу и ищем в ней географию: море, горы, лес,
      стороны света, материки, размеры, города, маяки…
   2) Нашли масштаб мира (материки, королевства, км, стороны
      света) → строим КАРТУ (шейдер рисует рельеф).
      Не нашли → строим ДИОРАМУ из кубиков (воксели + свет,
      тени-AO, туман, вода).
   3) Оптимизация: рисуем в уменьшенном разрешении, 15–24 кадра
      в секунду (6 — пока вы печатаете), ничего не рисуем во
      вкладке в фоне, пересобираем мир только когда текст
      изменился, а при смене темы освобождаем видеопамять.
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
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
      let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let i = 0; i < (o || 5); i++) {
        s += n2(x * f, y * f) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2.03;
      }
      return s / norm;
    };
    const ridge = (x, y, o) => {
      let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let i = 0; i < (o || 4); i++) {
        s += (1 - Math.abs(n2(x * f, y * f) * 2 - 1)) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2.1;
      }
      const v = s / norm;
      return v * v;
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
    river: W('рек(?:а|и|у|ой|е|ам|ами|ах)' + END + '|речк|речн|ручей|ручь|водопад|river|stream|waterfall'),
    lake: W('озер|пруд|lake|pond'),
    swamp: W('болот|топь|топи|трясин|swamp|marsh|bog'),
    plain: W('равнин|степ|луг|пол(?:е|я|ей|ям)' + END + '|долин|plain|steppe|meadow|field|valley'),
    city: W('город|столиц|порт(?:а|у|ом|е)?' + END + '|city|town|capital|harbou?r'),
    village: W('деревн|посел|хутор|village|hamlet'),
    lighthouse: W('маяк|lighthouse'),
    castle: W('замок|замк|крепост|цитадел|castle|fortress|citadel'),
    tower: W('башн|tower'),
    house: W('дом(?:а|е|у|ом|ик|ой)?' + END + '|хижин|изб[аеуы]|house|cabin|hut' + END),
    bridge: W('мост' + END + '|моста|мосту|мостом|bridge'),
    road: W('дорог|тропа|тропинк|road|path'),
    temple: W('храм|церк|монастыр|temple|church|monastery'),
    ship: W('корабл|лодк|паром|судн|ship|boat|ferry'),
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
  const NAME = /(?<![\p{L}])(город[\p{L}]*|остров[\p{L}]*|рек[аиуе]|гор[аыу]|мор[еяю]|озер[\p{L}]*|королевств[\p{L}]*|деревн[\p{L}]*|порт[\p{L}]*|крепост[\p{L}]*|замок|материк[\p{L}]*|континент[\p{L}]*|лес[\p{L}]*|пустын[\p{L}]*|city|island|river|mount|lake|kingdom|sea|town)\s+«?([А-ЯЕA-Z][\p{L}’'-]{1,20})/gu;
  const NAME_TYPE = [
    [/^(город|порт|city|town)/i, 'city'], [/^(остров|island)/i, 'island'], [/^(рек|river)/i, 'river'], [/^(гор|mount)/i, 'mountain'],
    [/^(мор|sea)/i, 'sea'], [/^(озер|lake)/i, 'lake'], [/^(королевств|kingdom)/i, 'realm'], [/^(деревн)/i, 'village'],
    [/^(крепост|замок)/i, 'castle'], [/^(материк|континент)/i, 'continent'], [/^(лес)/i, 'forest'], [/^(пустын)/i, 'desert'], [/^(маяк)/i, 'lighthouse'],
  ];
  const GEO = ['sea', 'island', 'mountain', 'volcano', 'hills', 'forest', 'desert', 'snow', 'river', 'lake', 'swamp', 'plain'];

  function analyze(raw) {
    const text = raw.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
    const cnt = {}, dir = {}, dl = {}, names = [], seen = new Set();
    const sentences = text.split(/(?<=[.!?…])\s+|\n+/);
    for (const s of sentences) {
      if (s.length < 3) continue;
      let dx = 0, dy = 0, any = false;
      for (const [re, x, y] of DIRS) {
        re.lastIndex = 0;
        if (re.test(s)) {
          dx += x;
          dy += y;
          any = true;
        }
      }
      // «к востоку ОТ гор — пустыня»: горы здесь ориентир, а не то, что на востоке
      const noRef = any ? s.replace(/(?<![\p{L}])от\s+[\p{L}-]+/giu, ' ') : s;
      for (const k in FEATS) {
        const re = FEATS[k];
        re.lastIndex = 0;
        const m = s.match(re);
        if (!m) continue;
        cnt[k] = (cnt[k] || 0) + m.length;
        if (any) {
          re.lastIndex = 0;
          if (re.test(noRef)) {
            const d = dir[k] || (dir[k] = { x: 0, y: 0, n: 0 });
            const len = Math.hypot(dx, dy) || 1;
            d.x += dx / len;
            d.y += dy / len;
            d.n++;
            // Каждое упоминание отдельно: «на севере материк… в центре… на юге материк» = три разных места
            (dl[k] || (dl[k] = [])).push({ x: dx / len, y: dy / len });
          }
        }
      }
      // Названия: «материк Сайрон», «Река Мейра» (тип с заглавной делаем строчным)
      const ns = s.replace(/(?<![\p{L}])([А-ЯA-Z])(?=[\p{Ll}]+\s+«?[А-ЯA-Z])/gu, (m) => m.toLowerCase());
      for (const m of ns.matchAll(NAME)) {
        const nm = m[2];
        const tt = NAME_TYPE.find(([re]) => re.test(m[1]));
        if (!tt || seen.has(nm) || names.length >= 24) continue;
        seen.add(nm);
        const len = Math.hypot(dx, dy) || 1;
        names.push({ name: nm, type: tt[1], dir: any ? { x: dx / len, y: dy / len } : null });
      }
    }
    for (const k in dir) {
      dir[k].x /= dir[k].n;
      dir[k].y /= dir[k].n;
    }
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
    const dirGeo = Object.keys(dir).filter((k) => GEO.includes(k)).length;
    const maxKm = sizes.length ? Math.max(...sizes) : 0;
    const score =
      // одно «на материке» = «на большой земле», а не карта мира
      (mm.continent >= 2 ? 3 : mm.continent ? 1 : 0) + (mm.realm ? 2 : 0) + (mm.globe ? 2 : 0) + (mm.map ? 1 : 0) +
      (maxKm >= 50 ? 2 : 0) + ((counts.continent || 0) > 1 ? 2 : 0) + (dirGeo >= 2 ? 2 : 0) + (dirGeo >= 4 ? 1 : 0);
    return {
      mode: score >= 3 ? 'map' : 'diorama',
      score, cnt, dir, dl, mm, counts, maxKm, time, tm, names,
      seed: hashStr(text),
    };
  }

  /* =========================================================
     2а. КАРТА: рельеф считаем один раз на процессоре в маленькую
     текстуру 320×200, а красит её шейдер на видеокарте.
     ========================================================= */
  function genMap(f) {
    const TW = 320, TH = 200, AR = TW / TH;
    const N = makeNoise(f.seed);
    const R = rng(f.seed ^ 0x9e3779b9);
    const c = f.cnt;
    const sea = c.sea || 0;
    const land = (c.mountain || 0) + (c.forest || 0) + (c.desert || 0) + (c.plain || 0) + (c.city || 0);
    // Места материков, о которых сказано «на севере / в центре / на юге» (без повторов)
    const cdirs = [];
    (f.dl.continent || []).concat(f.names.filter((n) => n.type === 'continent' && n.dir).map((n) => n.dir)).forEach((v) => {
      if (!cdirs.some((u) => Math.hypot(u.x - v.x, u.y - v.y) < 0.3)) cdirs.push(v);
    });
    const nCont = clamp(Math.max(f.counts.continent || 0, cdirs.length) || (f.mm.continent ? 2 + ((R() * 2) | 0) : 1 + ((R() * 2) | 0)), 1, 7);
    const nIsl = clamp(f.counts.island || (c.island ? 3 + Math.min(10, c.island) : 2), 0, 16);
    const blobs = [];
    for (let i = 0; i < nCont; i++) {
      let best = null;
      for (let k = 0; k < 24; k++) {
        const cand = { x: 0.25 + R() * (AR - 0.5), y: 0.22 + R() * 0.56 };
        const dmin = blobs.reduce((m, b) => Math.min(m, Math.hypot(b.x - cand.x, b.y - cand.y)), 9);
        if (!best || dmin > best.d) best = { ...cand, d: dmin };
      }
      blobs.push({ x: best.x, y: best.y, r: (0.34 / Math.sqrt(nCont)) * (0.8 + R() * 0.5) + 0.06 });
    }
    // «На севере — материк Х»: ставим материки туда, куда сказано в книге
    cdirs.slice(0, nCont).forEach((v, i) => {
      // лёгкий сдвиг вбок, чтобы между материками остался пролив
      blobs[i].x = AR / 2 + v.x * AR * 0.3 + (v.x ? 0 : (i % 2 ? 1 : -1) * 0.12 * (cdirs.length > 2 ? 1 : 0));
      blobs[i].y = 0.5 + v.y * 0.34;
      blobs[i].dir = v;
      if (cdirs.length > 1) blobs[i].r = Math.min(blobs[i].r, 0.21);
    });
    for (let i = 0; i < nIsl; i++) {
      const b = blobs[(R() * blobs.length) | 0];
      const a = R() * Math.PI * 2, d = b.r * (1.05 + R() * 0.7);
      blobs.push({ x: clamp(b.x + Math.cos(a) * d, 0.05, AR - 0.05), y: clamp(b.y + Math.sin(a) * d, 0.05, 0.95), r: 0.025 + R() * 0.05 });
    }
    const seaLevel = sea > land * 1.5 ? 0.06 : sea ? 0 : -0.16;
    // Области климата и рельефа: туда, где сказано в книге, или случайно
    const regs = [];
    const STR = { mountain: 1, hills: 0.8, volcano: 1, desert: 1, forest: 0.9, snow: 1, swamp: 0.9, plain: 0.7, lake: 0.8 };
    for (const k in STR) {
      if (!c[k]) continue;
      const d = f.dir[k];
      const b = blobs[(R() * Math.min(nCont, blobs.length)) | 0];
      const cx = d ? AR / 2 + d.x * AR * 0.3 : b.x + (R() - 0.5) * b.r;
      const cy = d ? 0.5 + d.y * 0.32 : b.y + (R() - 0.5) * b.r;
      regs.push({ k, x: cx, y: cy, r: 0.22 + Math.min(0.2, c[k] * 0.02), s: STR[k] * clamp(0.5 + c[k] * 0.1, 0.5, 1.4) });
    }
    const H = new Float32Array(TW * TH), M = new Float32Array(TW * TH), T = new Float32Array(TW * TH), A = new Uint8Array(TW * TH);
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        const px = x / TH, py = y / TH, i = y * TW + x;
        const wx = px + (N.fbm(px * 3, py * 3, 3) - 0.5) * 0.22, wy = py + (N.fbm(px * 3 + 7, py * 3 + 3, 3) - 0.5) * 0.22;
        let ld = -1, l1 = -9, l2 = -9;
        blobs.forEach((b, bi) => {
          const v = 1 - Math.hypot(wx - b.x, wy - b.y) / b.r;
          ld = Math.max(ld, v);
          if (bi < nCont) { if (v > l1) { l2 = l1; l1 = v; } else if (v > l2) l2 = v; }
        });
        // Если материков несколько, шум слабее — иначе они срастаются перешейками
        let h = ld * 0.5 + (N.fbm(px * 4, py * 4, 5) - 0.5) * (nCont > 1 ? 0.36 : 0.5) - seaLevel - 0.03;
        if (sea) h -= sstep(0.14, 0, Math.min(px, AR - px, py, 1 - py)) * 0.45;
        // Пролив: там, где два материка «спорят» за землю, опускаем её под воду
        if (nCont > 1 && l2 > -0.5) h -= sstep(0.16, 0, l1 - l2) * 0.32;
        let temp = 1 - Math.abs(py - 0.5) * 1.4 + (N.fbm(px * 2 + 11, py * 2, 3) - 0.5) * 0.3;
        let moist = N.fbm(px * 3 + 21, py * 3 + 5, 4);
        let lava = 0;
        for (const r of regs) {
          const w = sstep(1, 0, Math.hypot(wx - r.x, wy - r.y) / r.r) * r.s;
          if (w <= 0) continue;
          switch (r.k) {
            case 'mountain': if (h > -0.08) h += w * (N.ridge(px * 7, py * 7) * 0.8 + 0.06); break;
            case 'hills': if (h > -0.05) h += w * N.fbm(px * 12, py * 12, 3) * 0.18; break;
            case 'volcano': if (h > -0.1) { const cone = sstep(0.55, 0, Math.hypot(wx - r.x, wy - r.y) / r.r); h += cone * 0.7; if (cone > 0.85) lava = 1; } break;
            case 'desert': moist -= w * 0.9; temp += w * 0.3; break;
            case 'forest': moist += w * 0.55; break;
            case 'snow': temp -= w * 1.1; break;
            case 'swamp': moist += w * 0.9; if (h > 0) h = h * (1 - w * 0.8) + 0.015 * w; break;
            case 'plain': if (h > 0) h *= 1 - w * 0.5; break;
            case 'lake': if (h > 0.06) h -= w * w * 0.32; break;
          }
        }
        H[i] = h;
        M[i] = clamp(moist, 0, 1);
        // Лава помечается температурой 1.0 (обычная земля ≤ 0.96): так её не спутать с рекой при сглаживании
        T[i] = lava ? 1 : clamp(temp, 0, 0.96);
        A[i] = 0;
      }
    }
    // Реки: от высоких точек вниз по склону, пока не дойдём до воды
    const riverPts = [];
    if (c.river) {
      const nr = clamp(2 + (c.river >> 1), 2, 8);
      for (let r = 0; r < nr; r++) {
        const path = [];
        riverPts.push(path);
        let bx = 0, by = 0, bh = -9;
        for (let k = 0; k < 60; k++) {
          const x = (R() * TW) | 0, y = (R() * TH) | 0;
          if (H[y * TW + x] > bh && H[y * TW + x] < 0.6) { bh = H[y * TW + x]; bx = x; by = y; }
        }
        let x = bx, y = by;
        for (let s = 0; s < 700 && H[y * TW + x] > 0; s++) {
          A[y * TW + x] = 255;
          path.push([x, y]);
          let nx = x, ny = y, nh = H[y * TW + x];
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const xx = clamp(x + ox, 0, TW - 1), yy = clamp(y + oy, 0, TH - 1);
            const hh = H[yy * TW + xx] + R() * 0.004;
            if (hh < nh) { nh = hh; nx = xx; ny = yy; }
          }
          if (nx === x && ny === y) { H[y * TW + x] -= 0.02; continue; } // яма: углубляем, река прорежет путь
          x = nx; y = ny;
        }
      }
    }
    // Метки: города, деревни, крепости, маяки (с именами из книги, если есть)
    const marks = [];
    const nameOf = (type) => {
      const i = f.names.findIndex((n) => n.type === type && !n.used);
      if (i < 0) return '';
      f.names[i].used = true;
      return f.names[i].name;
    };
    f.names.forEach((n) => (n.used = false));
    const place = (type, n, coast) => {
      const d = f.dir[type];
      const tx = d ? (AR / 2 + d.x * AR * 0.3) * TH : 0, ty = d ? (0.5 + d.y * 0.34) * TH : 0;
      for (let k = 0, tries = 0; k < n && tries < 600; tries++) {
        const x = (R() * TW) | 0, y = (R() * TH) | 0, h = H[y * TW + x];
        if (h < 0.01 || h > 0.3) continue;
        // «на юге стоит город» — первые попытки ищем только в той стороне
        if (d && tries < 450 && Math.hypot(x - tx, y - ty) > TH * 0.28) continue;
        if (coast) {
          let wet = false;
          for (let o = -3; o <= 3 && !wet; o++) wet = H[y * TW + clamp(x + o, 0, TW - 1)] < 0 || H[clamp(y + o, 0, TH - 1) * TW + x] < 0;
          if (!wet) continue;
        }
        if (marks.some((m) => Math.hypot(m.x * TW - x, m.y * TH - y) < 14)) continue;
        marks.push({ x: (x + 0.5) / TW, y: (y + 0.5) / TH, type, name: nameOf(type) });
        k++;
      }
    };
    place('city', clamp(Math.ceil((c.city || 0) / 3), c.city ? 1 : 0, 6), !!sea);
    place('castle', clamp(Math.ceil((c.castle || 0) / 3), c.castle ? 1 : 0, 3));
    place('village', clamp(Math.ceil((c.village || 0) / 3), c.village ? 1 : 0, 4));
    place('lighthouse', c.lighthouse ? 1 : 0, true);
    // Материк с названием — подпись в центр «его» материка; река — на середину самой длинной реки
    f.names.filter((n) => !n.used && n.type === 'continent').forEach((n, i) => {
      const b = (n.dir && blobs.find((bb) => bb.dir && Math.hypot(bb.dir.x - n.dir.x, bb.dir.y - n.dir.y) < 0.3)) || blobs[i];
      if (!b) return;
      n.used = true;
      marks.push({ x: b.x / AR, y: b.y, type: 'label', name: n.name });
    });
    riverPts.sort((a, b) => b.length - a.length);
    f.names.filter((n) => !n.used && n.type === 'river').forEach((n, i) => {
      const p = riverPts[i];
      if (!p || p.length < 6) return;
      n.used = true;
      const [x, y] = p[(p.length / 2) | 0];
      marks.push({ x: (x + 0.5) / TW, y: (y + 0.5) / TH, type: 'label', name: n.name });
    });
    // Королевство — на центральный материк (если он описан), иначе на самый большой
    f.names.filter((n) => !n.used && n.type === 'realm').slice(0, 1).forEach((n) => {
      const main = blobs.slice(0, nCont);
      const b = main.find((bb) => bb.dir && Math.hypot(bb.dir.x, bb.dir.y) < 0.3) || main.sort((a, bb) => bb.r - a.r)[0];
      n.used = true;
      marks.push({ x: (b.x - b.r * 0.35) / AR, y: b.y - b.r * 0.25, type: 'label', name: n.name });
    });
    // Подписи для остальных названий (горы, моря…) ставим в «свои» места
    f.names.filter((n) => !n.used).slice(0, 8).forEach((n) => {
      for (let tries = 0; tries < 300; tries++) {
        const x = (R() * TW) | 0, y = (R() * TH) | 0, h = H[y * TW + x];
        const ok = { sea: h < -0.1, lake: h < 0 && h > -0.15, mountain: h > 0.35, island: h > 0 && h < 0.2, river: A[y * TW + x] === 255 }[n.type];
        if (ok === undefined ? h > 0.02 : ok) {
          marks.push({ x: (x + 0.5) / TW, y: (y + 0.5) / TH, type: 'label', name: n.name });
          break;
        }
      }
    });
    const data = new Uint8Array(TW * TH * 4);
    for (let i = 0; i < TW * TH; i++) {
      data[i * 4] = clamp(((H[i] + 1) / 2) * 255, 0, 255);
      data[i * 4 + 1] = M[i] * 255;
      data[i * 4 + 2] = T[i] * 255;
      data[i * 4 + 3] = A[i];
    }
    return { w: TW, h: TH, data, marks };
  }

  /* =========================================================
     2б. ДИОРАМА ИЗ КУБИКОВ (воксели 44×44×28)
     ========================================================= */
  // Палитра: [r, g, b, вид] — вид 0 обычный, 1 вода, 2 светится
  const PAL = [
    null,
    [96, 152, 70, 0], [118, 168, 78, 0], [121, 90, 60, 0], [120, 118, 112, 0], [222, 204, 150, 0], // 1 трава,2 трава,3 земля,4 камень,5 песок
    [238, 242, 246, 0], [52, 118, 160, 1], [110, 76, 48, 0], [58, 112, 54, 0], [80, 136, 62, 0], //  6 снег,7 вода,8 дерево,9 листва,10 листва
    [236, 232, 222, 0], [196, 58, 52, 0], [255, 214, 120, 2], [92, 64, 70, 0], [212, 196, 168, 0], // 11 белый,12 красный,13 огонь маяка,14 крыша,15 стена
    [150, 150, 156, 0], [226, 180, 72, 0], [255, 96, 30, 2], [78, 96, 58, 0], [214, 172, 104, 0], // 16 серый камень,17 золото,18 лава,19 болото,20 пустыня
    [40, 84, 60, 0], [255, 196, 110, 2], [150, 110, 80, 0], [176, 92, 64, 0], [124, 140, 150, 0], // 21 ель,22 окно,23 доски,24 черепица,25 сланец
  ];
  function genVox(f) {
    const N = 44, HY = 28, SEA = 4;
    const R = rng(f.seed ^ 0x51ed27);
    const NZ = makeNoise(f.seed);
    const c = f.cnt;
    const vox = new Uint8Array(N * N * HY);
    const at = (x, y, z) => (y * N + z) * N + x;
    const inb = (x, y, z) => x >= 0 && x < N && z >= 0 && z < N && y >= 0 && y < HY;
    const set = (x, y, z, v) => inb(x, y, z) && (vox[at(x, y, z)] = v);
    const get = (x, y, z) => (inb(x, y, z) ? vox[at(x, y, z)] : 0);
    const hasSea = (c.sea || 0) + (c.island || 0) + (c.ship || 0) + (c.lighthouse || 0) > 0;
    const snowy = (c.snow || 0) >= 2, desert = (c.desert || 0) >= 2 && !snowy, swamp = (c.swamp || 0) >= 2;
    const spot = (k) => {
      const d = f.dir[k];
      return d ? { x: N / 2 + d.x * N * 0.28, z: N / 2 + d.y * N * 0.28 } : { x: N * (0.25 + R() * 0.5), z: N * (0.25 + R() * 0.5) };
    };
    const mt = c.mountain || c.volcano ? spot(c.volcano ? 'volcano' : 'mountain') : null;
    const hl = c.hills ? spot('hills') : null;
    // Рельеф
    const hm = new Int16Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const nx = (x - N / 2) / (N / 2), nz = (z - N / 2) / (N / 2);
      let h;
      if (hasSea) h = SEA + (1 - Math.hypot(nx, nz) * 1.12 + (NZ.fbm(x * 0.08, z * 0.08, 4) - 0.5) * 0.8) * 7;
      else h = SEA + 3 + (NZ.fbm(x * 0.07, z * 0.07, 4) - 0.5) * 7;
      if (mt) {
        const w = sstep(13, 0, Math.hypot(x - mt.x, z - mt.z));
        h += w * (c.volcano ? 15 * w : 5 + NZ.ridge(x * 0.11, z * 0.11) * 12);
      }
      if (hl) h += sstep(10, 0, Math.hypot(x - hl.x, z - hl.z)) * NZ.fbm(x * 0.2, z * 0.2, 3) * 6;
      hm[z * N + x] = clamp(Math.round(h), 1, HY - 10);
    }
    const H = (x, z) => hm[clamp(z, 0, N - 1) * N + clamp(x, 0, N - 1)];
    // Озеро и река
    const water = new Uint8Array(N * N); // 1 = вода в этой колонке до уровня wl
    const wl = new Int16Array(N * N).fill(SEA);
    if (c.lake) {
      const p = spot('lake');
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < 4.5 && H(x, z) > SEA) { const lvl = H(Math.round(p.x), Math.round(p.z)); hm[z * N + x] = lvl - 2; wl[z * N + x] = lvl - 1; water[z * N + x] = 1; }
      }
    }
    if (c.river) {
      let x = mt ? Math.round(mt.x) : (N / 2) | 0, z = mt ? Math.round(mt.z) : (N / 2) | 0;
      for (let s = 0; s < 120; s++) {
        let bx = x, bz = z, bh = H(x, z) + 0.5;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oz]) => { const hh = H(x + ox, z + oz) + R() * 0.8; if (hh < bh) { bh = hh; bx = x + ox; bz = z + oz; } });
        if (bx === x && bz === z) { bx = x + (R() < 0.5 ? 1 : -1); }
        x = clamp(bx, 0, N - 1); z = clamp(bz, 0, N - 1);
        const i = z * N + x;
        if (H(x, z) <= SEA) break;
        wl[i] = H(x, z) - 1; hm[i] = H(x, z) - 2; water[i] = 1;
      }
    }
    // Колонки земли
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const h = H(x, z), i = z * N + x;
      const steep = Math.max(Math.abs(h - H(x + 1, z)), Math.abs(h - H(x - 1, z)), Math.abs(h - H(x, z + 1)), Math.abs(h - H(x, z - 1))) >= 3;
      let top = NZ.n2(x * 0.5, z * 0.5) > 0.5 ? 2 : 1;
      if (desert) top = 20;
      if (swamp && h <= SEA + 2) top = 19;
      if (hasSea && h <= SEA + 1) top = 5;
      if (steep) top = 4;
      if (h >= SEA + 13 || (snowy && h >= SEA + 4)) top = 6;
      for (let y = 0; y <= h; y++) set(x, y, z, y === h ? top : y >= h - 2 ? (top === 5 || top === 20 ? 5 : 3) : 4);
      if (c.volcano && mt && Math.hypot(x - mt.x, z - mt.z) < 1.6) set(x, h, z, 18);
      const lvl = water[i] ? wl[i] : SEA;
      if ((hasSea || water[i]) && h < lvl) for (let y = h + 1; y <= lvl; y++) set(x, y, z, 7);
    }
    // Занятость клеток постройками
    const used = new Uint8Array(N * N);
    const isLand = (x, z) => x > 1 && z > 1 && x < N - 2 && z < N - 2 && get(x, H(x, z), z) !== 7 && H(x, z) > SEA && !water[z * N + x];
    const flat = (x, z, r) => {
      const h = H(x, z);
      for (let oz = -r; oz <= r; oz++) for (let ox = -r; ox <= r; ox++) {
        if (!isLand(x + ox, z + oz) || used[(z + oz) * N + x + ox] || Math.abs(H(x + ox, z + oz) - h) > 1) return false;
      }
      return true;
    };
    const find = (k, r, coast) => {
      const want = f.dir[k] ? spot(k) : null;
      let best = null;
      for (let tries = 0; tries < 300; tries++) {
        const x = 2 + ((R() * (N - 4)) | 0), z = 2 + ((R() * (N - 4)) | 0);
        if (!flat(x, z, r)) continue;
        let score = R();
        if (want) score -= Math.hypot(x - want.x, z - want.z) / N;
        if (coast) {
          let d = 9;
          for (let o = -6; o <= 6; o++) {
            if (get(x + o, SEA, z) === 7) d = Math.min(d, Math.abs(o));
            if (get(x, SEA, z + o) === 7) d = Math.min(d, Math.abs(o));
          }
          if (d > 5) continue;
          score += (6 - d) * 0.3 + H(x, z) * 0.1;
        }
        if (!best || score > best.s) best = { x, z, s: score };
      }
      if (best) for (let oz = -r - 1; oz <= r + 1; oz++) for (let ox = -r - 1; ox <= r + 1; ox++) if (inb(best.x + ox, 0, best.z + oz)) used[(best.z + oz) * N + best.x + ox] = 1;
      return best;
    };
    const night = f.time === 'night' || f.time === 'dusk';
    const labels = [];
    const box = (x0, y0, z0, w, h, d, v) => { for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) set(x, y, z, v); };
    const house = (x, z, w, d, hh, wall, roof) => {
      const y = H(x, z) + 1;
      box(x, y, z, w, hh, d, wall);
      if (night) for (let k = 0; k < Math.max(1, (w * hh) / 4); k++) set(x + ((R() * w) | 0), y + 1 + ((R() * (hh - 1)) | 0), R() < 0.5 ? z - 0 : z + d - 1, 22);
      for (let l = 0; l < Math.ceil(Math.min(w, d) / 2); l++) box(x + l, y + hh + l, z + l, w - l * 2, 1, d - l * 2, roof);
      return y + hh + 1;
    };
    const tree = (x, z, pine) => {
      const y = H(x, z) + 1;
      const th = 2 + ((R() * 2) | 0);
      for (let k = 0; k < th; k++) set(x, y + k, z, 8);
      const leaf = pine ? 21 : R() < 0.5 ? 9 : 10;
      if (pine) {
        for (let l = 0; l < 4; l++) { const r = l < 2 ? 1 : 0; box(x - r, y + th + l - 1, z - r, r * 2 + 1, 1, r * 2 + 1, leaf); }
        if (snowy) set(x, y + th + 3, z, 6);
      } else {
        box(x - 1, y + th, z - 1, 3, 2, 3, leaf);
        set(x, y + th + 2, z, leaf);
      }
    };
    // Маяк — на берегу, повыше
    if (c.lighthouse) {
      const p = find('lighthouse', 1, true);
      if (p) {
        const y0 = H(p.x, p.z) + 1, hh = 11;
        for (let k = 0; k < hh; k++) box(p.x - 1, y0 + k, p.z - 1, 2, 1, 2, ((k / 2) | 0) % 2 ? 12 : 11);
        box(p.x - 2, y0 + hh, p.z - 2, 4, 1, 4, 16);
        box(p.x - 1, y0 + hh + 1, p.z - 1, 2, 1, 2, 13);
        box(p.x - 1, y0 + hh + 2, p.z - 1, 2, 1, 2, 12);
        house(p.x + 2, p.z + 1, 3, 3, 2, 11, 12);
        labels.push({ x: p.x, y: y0 + hh + 3, z: p.z, key: 'lighthouse' });
      }
    }
    if (c.city) {
      const p = find('city', 3);
      if (p) {
        const n = clamp(4 + c.city, 5, 12);
        for (let k = 0; k < n; k++) {
          const x = p.x - 4 + ((R() * 8) | 0), z = p.z - 4 + ((R() * 8) | 0);
          if (!isLand(x, z) || !isLand(x + 2, z + 2)) continue;
          if (get(x, H(x, z) + 1, z)) continue;
          house(x, z, 2 + ((R() * 2) | 0), 2 + ((R() * 2) | 0), 2 + ((R() * 4) | 0), R() < 0.5 ? 15 : 16, R() < 0.5 ? 24 : 14);
        }
        labels.push({ x: p.x, y: H(p.x, p.z) + 8, z: p.z, key: 'city' });
      }
    }
    if (c.village) {
      const p = find('village', 2);
      if (p) {
        for (let k = 0; k < 3; k++) house(p.x - 2 + k * 2, p.z - 1 + (k % 2) * 2, 2, 2, 2, 23, 14);
        labels.push({ x: p.x, y: H(p.x, p.z) + 5, z: p.z, key: 'village' });
      }
    }
    if (c.castle) {
      const p = find('castle', 3);
      if (p) {
        const y0 = H(p.x, p.z) + 1;
        for (let o = -3; o <= 3; o++) { box(p.x + o, y0, p.z - 3, 1, 3, 1, 16); box(p.x + o, y0, p.z + 3, 1, 3, 1, 16); box(p.x - 3, y0, p.z + o, 1, 3, 1, 16); box(p.x + 3, y0, p.z + o, 1, 3, 1, 16); }
        [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(([ox, oz]) => box(p.x + ox, y0, p.z + oz, 1, 6, 1, 25));
        house(p.x - 1, p.z - 1, 3, 3, 5, 16, 25);
        labels.push({ x: p.x, y: y0 + 9, z: p.z, key: 'castle' });
      }
    }
    if (c.tower && !c.castle) {
      const p = find('tower', 1);
      if (p) { const y0 = H(p.x, p.z) + 1; box(p.x, y0, p.z, 2, 9, 2, 16); box(p.x, y0 + 9, p.z, 2, 1, 2, 25); labels.push({ x: p.x, y: y0 + 11, z: p.z, key: 'tower' }); }
    }
    if (c.temple) {
      const p = find('temple', 2);
      if (p) { house(p.x - 1, p.z - 1, 3, 3, 4, 11, 17); labels.push({ x: p.x, y: H(p.x, p.z) + 8, z: p.z, key: 'temple' }); }
    }
    if (c.house || (!c.city && !c.village && !c.castle)) {
      const n = clamp(Math.ceil((c.house || 1) / 4), 1, 3);
      for (let k = 0; k < n; k++) { const p = find('house', 1); if (p) house(p.x - 1, p.z - 1, 3, 3, 2, 23, 14); }
    }
    if (c.ship && hasSea) {
      for (let tries = 0; tries < 200; tries++) {
        const x = 3 + ((R() * (N - 8)) | 0), z = 3 + ((R() * (N - 6)) | 0);
        let ok = true;
        for (let o = -1; o <= 4 && ok; o++) ok = get(x + o, SEA, z) === 7 && get(x + o, SEA, z - 2) === 7 && get(x + o, SEA, z + 2) === 7;
        if (!ok) continue;
        box(x, SEA + 1, z, 4, 1, 1, 8); box(x + 1, SEA + 2, z, 2, 1, 1, 23); box(x + 2, SEA + 3, z, 1, 3, 1, 8); box(x + 1, SEA + 4, z, 1, 2, 1, 11);
        labels.push({ x: x + 2, y: SEA + 7, z, key: 'ship' });
        break;
      }
    }
    // Лес
    const forestN = c.forest ? clamp(14 + c.forest * 4, 14, 70) : desert ? 0 : 8;
    const fc = c.forest ? spot('forest') : null;
    for (let k = 0, tries = 0; k < forestN && tries < 1200; tries++) {
      let x, z;
      if (fc && R() < 0.8) { x = Math.round(fc.x + (R() - 0.5) * 18); z = Math.round(fc.z + (R() - 0.5) * 18); }
      else { x = 2 + ((R() * (N - 4)) | 0); z = 2 + ((R() * (N - 4)) | 0); }
      if (!isLand(x, z) || used[z * N + x] || get(x, H(x, z) + 1, z)) continue;
      const top = get(x, H(x, z), z);
      if (top === 4 || top === 5 || top === 6 && !snowy) continue;
      used[z * N + x] = 1;
      tree(x, z, snowy || H(x, z) > SEA + 8);
      k++;
    }
    if (fc && c.forest) labels.push({ x: fc.x, y: H(Math.round(fc.x), Math.round(fc.z)) + 6, z: fc.z, key: 'forest' });
    if (mt) labels.push({ x: mt.x, y: H(Math.round(mt.x), Math.round(mt.z)) + 3, z: mt.z, key: c.volcano ? 'volcano' : 'mountain' });
    // Имена из книги — к подходящим объектам
    const names = f.names.slice();
    labels.forEach((l) => {
      const i = names.findIndex((n) => n.type === l.key);
      l.name = i >= 0 ? names.splice(i, 1)[0].name : '';
    });
    return { N, HY, SEA, vox, labels };
  }

  // Собираем из вокселей только видимые грани + мягкие тени в углах (AO)
  function meshVox(g) {
    const { N, HY, vox } = g;
    const at = (x, y, z) => (y * N + z) * N + x;
    const get = (x, y, z) => (x < 0 || x >= N || z < 0 || z >= N || y < 0 || y >= HY ? 0 : vox[at(x, y, z)]);
    const solid = (x, y, z) => { const v = get(x, y, z); return v && PAL[v][3] !== 1 ? 1 : 0; };
    const DIR = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let faces = 0;
    for (let y = 0; y < HY; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!vox[at(x, y, z)]) continue;
      for (let d = 0; d < 6; d++) { const [dx, dy, dz] = DIR[d]; if (y + dy >= 0 && !get(x + dx, y + dy, z + dz)) faces++; }
    }
    const V = faces * 6;
    const pos = new Float32Array(V * 3), col = new Uint8Array(V * 4), inf = new Uint8Array(V * 4);
    let vi = 0;
    const cu = [0, 1, 1, 0], cv = [0, 0, 1, 1];
    for (let y = 0; y < HY; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const v = vox[at(x, y, z)];
      if (!v) continue;
      const p = PAL[v];
      const shadeJitter = ((x * 7 + z * 13 + y * 3) % 5) * 3 - 6; // лёгкая неровность цвета
      for (let d = 0; d < 6; d++) {
        const n = DIR[d];
        if (y + n[1] < 0 || get(x + n[0], y + n[1], z + n[2])) continue;
        const ax = d >> 1, ua = (ax + 1) % 3, va = (ax + 2) % 3;
        const base = [x + n[0], y + n[1], z + n[2]];
        const corner = [], ao = [];
        for (let k = 0; k < 4; k++) {
          const c3 = [x, y, z];
          c3[ax] += n[ax] > 0 ? 1 : 0;
          c3[ua] += cu[k];
          c3[va] += cv[k];
          corner.push(c3);
          const du = cu[k] ? 1 : -1, dv = cv[k] ? 1 : -1;
          const s1 = base.slice(), s2 = base.slice(), cc = base.slice();
          s1[ua] += du; s2[va] += dv; cc[ua] += du; cc[va] += dv;
          const a1 = solid(...s1), a2 = solid(...s2), a3 = solid(...cc);
          ao.push(a1 && a2 ? 0 : 3 - (a1 + a2 + a3));
        }
        const order = ao[0] + ao[2] >= ao[1] + ao[3] ? [0, 1, 2, 0, 2, 3] : [1, 2, 3, 1, 3, 0];
        for (const k of order) {
          pos[vi * 3] = corner[k][0]; pos[vi * 3 + 1] = corner[k][1]; pos[vi * 3 + 2] = corner[k][2];
          col[vi * 4] = clamp(p[0] + shadeJitter, 0, 255); col[vi * 4 + 1] = clamp(p[1] + shadeJitter, 0, 255); col[vi * 4 + 2] = clamp(p[2] + shadeJitter, 0, 255);
          col[vi * 4 + 3] = p[3] === 2 ? 255 : (ao[k] / 3) * 255;
          inf[vi * 4] = n[0] + 1; inf[vi * 4 + 1] = n[1] + 1; inf[vi * 4 + 2] = n[2] + 1; inf[vi * 4 + 3] = p[3];
          vi++;
        }
      }
    }
    return { pos, col, inf, count: V, faces };
  }

  /* =========================================================
     3. РИСОВАНИЕ (WebGL 1 — работает почти везде)
     ========================================================= */
  const PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const VS_FULL = 'attribute vec2 aP; varying vec2 vUv; void main(){ vUv = aP * .5 + .5; gl_Position = vec4(aP, 0., 1.); }';
  const NOISE_GLSL = `
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }`;
  const FS_MAP = PREC + NOISE_GLSL + `
    uniform sampler2D uTex; uniform vec2 uRes, uTexel; uniform vec4 uView; uniform float uTime, uNight;
    uniform vec4 uMk[16]; uniform int uMkN;
    varying vec2 vUv;
    float hgt(vec2 p){ return texture2D(uTex, p).r * 2. - 1.; }
    void main(){
      vec2 uv = uView.xy + vec2(vUv.x, 1. - vUv.y) * uView.zw;
      vec4 s = texture2D(uTex, clamp(uv, 0., 1.));
      float H = s.r * 2. - 1., M = s.g, T = s.b, A = s.a;
      if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) H = -.6;
      float hx = hgt(uv + vec2(uTexel.x, 0.)) - hgt(uv - vec2(uTexel.x, 0.));
      float hy = hgt(uv + vec2(0., uTexel.y)) - hgt(uv - vec2(0., uTexel.y));
      vec3 n = normalize(vec3(-hx * 7., hy * 7., 1.));
      float shade = clamp(dot(n, normalize(vec3(-.55, .5, .7))), 0., 1.);
      vec3 col;
      if (H < 0.) {
        float d = clamp(-H * 2.4, 0., 1.);
        col = mix(vec3(.26, .55, .64), vec3(.05, .15, .27), d);
        float r = vnoise(uv * vec2(260., 160.) + vec2(uTime * .5, uTime * .35)) * vnoise(uv * vec2(140., 90.) - uTime * .25);
        col += (r - .25) * .07 * (1. - d * .7);
        col = mix(col, vec3(.86, .92, .92), smoothstep(-.035, 0., H) * (.25 + .15 * sin(uTime * 1.4 + uv.x * 90. + uv.y * 40.)));
      } else {
        vec3 sand = vec3(.85, .78, .57), grass = vec3(.43, .61, .31), forest = vec3(.21, .41, .22), desert = vec3(.87, .71, .45);
        vec3 tundra = vec3(.62, .64, .55), snow = vec3(.95, .96, .98), rock = vec3(.52, .48, .44), swamp = vec3(.33, .41, .26);
        vec3 low = mix(desert, mix(grass, forest, smoothstep(.45, .72, M)), smoothstep(.22, .42, M));
        low = mix(low, swamp, smoothstep(.8, .95, M) * smoothstep(.12, 0., H));
        low = mix(tundra, low, smoothstep(.18, .38, T));
        col = mix(sand, low, smoothstep(0., .03, H));
        col = mix(col, rock, smoothstep(.3, .48, H));
        col = mix(col, snow, max(smoothstep(.55, .7, H), smoothstep(.2, .08, T)));
        col *= .55 + .62 * shade;
        float c = fract(H * 16.);
        col *= 1. - .08 * smoothstep(.05, 0., c) * step(.03, H);
        col = mix(col, vec3(.2, .46, .62), smoothstep(.3, .75, A) * .85);
        if (T > .98 && H > .2) col = mix(col, vec3(1., .38, .1), .75 + .25 * sin(uTime * 2.));
      }
      float cl = vnoise(uv * vec2(7., 4.5) + uTime * vec2(.012, .005)) * vnoise(uv * vec2(13., 8.) - uTime * .009);
      col *= 1. - smoothstep(.25, .6, cl) * .2;
      col *= mix(1., .42, uNight);
      for (int i = 0; i < 16; i++) {
        if (i >= uMkN) break;
        vec4 m = uMk[i];
        vec2 dp = (uv - m.xy) / uView.zw * uRes;
        float r = length(dp);
        vec3 mc = m.z < .5 ? vec3(1., .86, .45) : m.z < 1.5 ? vec3(.95, .95, .95) : m.z < 2.5 ? vec3(.85, .4, .35) : vec3(1., .95, .7);
        if (m.z > 3.5) continue;
        col = mix(col, vec3(.08), smoothstep(6., 5., r));
        col = mix(col, mc, smoothstep(4.2, 3.2, r));
        col += mc * uNight * .5 * exp(-r * r / 90.);
      }
      vec2 q = vUv - .5;
      col *= 1. - dot(q, q) * .55;
      gl_FragColor = vec4(col, 1.);
    }`;
  const FS_SKY = PREC + NOISE_GLSL + `
    uniform vec3 uSky, uFog; uniform float uNight, uTime; varying vec2 vUv;
    void main(){
      vec3 c = mix(uFog, uSky, smoothstep(.15, .95, vUv.y));
      float st = step(.997, hash(floor(vUv * vec2(420., 260.)))) * uNight * smoothstep(.35, .8, vUv.y);
      c += st * (.6 + .4 * sin(uTime * 2. + vUv.x * 50.));
      gl_FragColor = vec4(c, 1.);
    }`;
  const VS_VOX = `
    attribute vec3 aPos; attribute vec4 aCol; attribute vec4 aInf;
    uniform mat4 uMVP; uniform float uTime;
    varying vec3 vCol, vN, vW; varying float vAo, vKind, vDepth;
    void main(){
      vec3 p = aPos;
      vKind = aInf.w;
      if (aInf.w > .5 && aInf.w < 1.5 && aInf.y > 1.5) p.y += sin(p.x * .7 + uTime * 1.3) * .1 + cos(p.z * .6 + uTime) * .08 - .18;
      vCol = aCol.rgb; vAo = aCol.a; vN = aInf.xyz - 1.; vW = p;
      gl_Position = uMVP * vec4(p, 1.);
      vDepth = gl_Position.w;
    }`;
  const FS_VOX = PREC + `
    uniform vec3 uSun, uSunCol, uSky, uGround, uFog; uniform float uFogD, uTime, uNight;
    varying vec3 vCol, vN, vW; varying float vAo, vKind, vDepth;
    void main(){
      vec3 n = normalize(vN);
      float dif = max(dot(n, uSun), 0.);
      vec3 amb = mix(uGround, uSky, n.y * .5 + .5);
      float ao = mix(.42, 1., vAo);
      vec3 c = vCol * (amb * ao + uSunCol * dif * mix(.55, 1., vAo));
      if (vKind > .5 && vKind < 1.5) {
        c += uSunCol * pow(max(dot(reflect(-uSun, n), normalize(vec3(.35, 1., .45))), 0.), 20.) * .3;
        c += .035 * sin(vW.x * 1.7 + uTime * 2.) * sin(vW.z * 1.3 - uTime * 1.6);
      }
      if (vKind > 1.5) c = vCol * (1.15 + uNight * 1.4) * (.86 + .14 * sin(uTime * 3. + vW.y));
      float fog = 1. - exp(-pow(vDepth / uFogD, 2.));
      c = mix(c, uFog, clamp(fog, 0., 1.) * .85);
      gl_FragColor = vec4(c, 1.);
    }`;
  // Освещение под время суток из книги
  const LIGHT = {
    day: { sky: [0.55, 0.74, 0.95], fog: [0.72, 0.83, 0.94], ground: [0.36, 0.32, 0.27], sunCol: [1, 0.95, 0.85], sun: [0.45, 0.8, 0.35], night: 0 },
    dusk: { sky: [0.42, 0.36, 0.6], fog: [0.95, 0.6, 0.48], ground: [0.26, 0.2, 0.26], sunCol: [1, 0.62, 0.38], sun: [0.85, 0.3, 0.2], night: 0.45 },
    night: { sky: [0.07, 0.1, 0.22], fog: [0.06, 0.08, 0.16], ground: [0.05, 0.05, 0.09], sunCol: [0.32, 0.42, 0.66], sun: [-0.3, 0.7, 0.45], night: 1 },
    storm: { sky: [0.36, 0.41, 0.48], fog: [0.44, 0.48, 0.53], ground: [0.19, 0.2, 0.22], sunCol: [0.56, 0.6, 0.65], sun: [0.3, 0.8, 0.4], night: 0.25 },
  };

  // Мини-библиотека матриц 4×4 (столбцами, как ждёт WebGL)
  const M4 = {
    persp(fov, a, n, f) { const t = 1 / Math.tan(fov / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; },
    look(e, c, u) {
      const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(u, z)), y = cross(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
    },
    mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
  };
  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  const FNAME = {
    ru: { sea: 'море', island: 'остров', mountain: 'горы', volcano: 'вулкан', hills: 'холмы', forest: 'лес', desert: 'пустыня', snow: 'снег и лёд', river: 'река', lake: 'озеро', swamp: 'болото', plain: 'равнины', city: 'город', village: 'деревня', lighthouse: 'маяк', castle: 'крепость', tower: 'башня', house: 'дом', bridge: 'мост', road: 'дорога', temple: 'храм', ship: 'корабль', continent: 'материк' },
    en: { sea: 'sea', island: 'island', mountain: 'mountains', volcano: 'volcano', hills: 'hills', forest: 'forest', desert: 'desert', snow: 'snow and ice', river: 'river', lake: 'lake', swamp: 'swamp', plain: 'plains', city: 'city', village: 'village', lighthouse: 'lighthouse', castle: 'fortress', tower: 'tower', house: 'house', bridge: 'bridge', road: 'road', temple: 'temple', ship: 'ship', continent: 'continent' },
  };
  const DIRNAME = (d) => {
    const ru = App.lang !== 'en';
    if (Math.hypot(d.x, d.y) < 0.3) return ru ? 'в центре' : 'in the center';
    const a = Math.atan2(d.y, d.x), k = Math.round(a / (Math.PI / 4));
    const names = ru ? ['на востоке', 'на юго-востоке', 'на юге', 'на юго-западе', 'на западе', 'на северо-западе', 'на севере', 'на северо-востоке'] : ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    return names[(k + 8) % 8];
  };

  /* =========================================================
     4. Управление темой
     ========================================================= */
  App.World3D = {
    on: false,
    facts: null,
    srcHash: 0,
    yaw: 0.6,
    drag: null,

    source() {
      const d = App.data;
      const parts = [];
      d.book.chapters.forEach((c) => parts.push(c.thesis, c.text));
      d.places.forEach((p) => parts.push([p.name, p.kind, p.desc, p.notes].join('. ')));
      return parts.join('\n');
    },

    // Включается/выключается вместе с темой «Мир книги»
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
      const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
      if (!gl) {
        this.canvas.remove();
        App.toast(t('world_nogl'), 'err');
        return;
      }
      this.gl = gl;
      this.on = true;
      try {
        this.pMap = this.program(VS_FULL, FS_MAP);
        this.pSky = this.program(VS_FULL, FS_SKY);
        this.pVox = this.program(VS_VOX, FS_VOX);
      } catch (e) {
        console.error(e);
        this.stop();
        return;
      }
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.onLost = (e) => { e.preventDefault(); this.lost = true; };
      this.onRestored = () => { this.lost = false; this.stop(); this.start(); };
      this.canvas.addEventListener('webglcontextlost', this.onLost);
      this.canvas.addEventListener('webglcontextrestored', this.onRestored);
      this.onResize = () => { this.resize(); this.kick(); };
      window.addEventListener('resize', this.onResize);
      this.onVis = () => !document.hidden && this.kick();
      document.addEventListener('visibilitychange', this.onVis);
      this.srcHash = 0;
      this.rebuild();
      this.resize();
      this.kick();
    },

    stop() {
      this.on = false;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      window.removeEventListener('resize', this.onResize);
      document.removeEventListener('visibilitychange', this.onVis);
      this.peek(false);
      if (this.gl) {
        const gl = this.gl;
        [this.quad, this.bPos, this.bCol, this.bInf].forEach((b) => b && gl.deleteBuffer(b));
        if (this.tex) gl.deleteTexture(this.tex);
        [this.pMap, this.pSky, this.pVox].forEach((p) => p && gl.deleteProgram(p.p));
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext(); // сразу отдаём видеопамять, не ждём сборщика мусора
      }
      if (this.canvas) this.canvas.remove();
      this.gl = this.canvas = this.tex = this.bPos = this.bCol = this.bInf = null;
      this.scene = null;
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

    // Разрешение ниже экранного: картинка размыта на фоне незаметно, а видеокарта отдыхает
    resize() {
      if (!this.canvas) return;
      const scale = this.peeking ? 0.85 : this.facts && this.facts.mode === 'map' ? 0.5 : 0.62;
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
      const t0 = performance.now();
      const f = analyze(src);
      const gl = this.gl;
      let stats = '';
      if (f.mode === 'map') {
        const m = genMap(f);
        if (!this.tex) this.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, m.w, m.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, m.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.scene = { mode: 'map', w: m.w, h: m.h, marks: m.marks };
        stats = { bytes: m.data.length };
      } else {
        const g = genVox(f);
        const mesh = meshVox(g);
        const up = (buf, data) => {
          const b = buf || gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, b);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
          return b;
        };
        this.bPos = up(this.bPos, mesh.pos);
        this.bCol = up(this.bCol, mesh.col);
        this.bInf = up(this.bInf, mesh.inf);
        this.scene = { mode: 'diorama', g, count: mesh.count, faces: mesh.faces };
        stats = { bytes: mesh.pos.byteLength + mesh.col.byteLength + mesh.inf.byteLength, faces: mesh.faces };
        // Сами массивы после загрузки в видеокарту больше не нужны — их заберёт сборщик мусора
      }
      this.facts = f;
      this.stats = { ms: Math.round(performance.now() - t0), ...stats };
      this.resize();
      this.renderPeek();
      this.kick();
    },
    schedule() {
      if (!this.on) return;
      clearTimeout(this.rt);
      // Пересборка — через 4 с после последней правки и в момент, когда браузер свободен
      this.rt = setTimeout(() => (window.requestIdleCallback || setTimeout)(() => this.rebuild(), { timeout: 2000 }), 4000);
    },

    kick() {
      if (!this.on || this.raf) return;
      this.raf = requestAnimationFrame((ts) => this.frame(ts));
    },
    frame(ts) {
      this.raf = 0;
      if (!this.on || document.hidden || this.lost) return; // вкладка в фоне — ничего не рисуем
      const motion = App.Theme.s.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      const typing = Date.now() - (this.typedAt || 0) < 1500;
      const fps = this.peeking ? 30 : typing ? 6 : this.scene && this.scene.mode === 'map' ? 15 : 24;
      if (!this.drawnOnce || ts - (this.last || 0) >= 1000 / fps - 2) {
        this.last = ts;
        this.time = motion || this.peeking ? ts / 1000 : this.time || 10;
        this.draw();
        this.drawnOnce = true;
        this.frames = (this.frames || 0) + 1;
      }
      if (motion || this.peeking || this.drag) this.kick();
    },

    draw() {
      const gl = this.gl, sc = this.scene;
      if (!gl || !sc) return;
      const W = this.canvas.width, H = this.canvas.height, tm = this.time;
      gl.viewport(0, 0, W, H);
      const L = LIGHT[this.facts.time] || LIGHT.day;
      const quad = (p) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        const loc = gl.getAttribLocation(p.p, 'aP');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disableVertexAttribArray(loc);
      };
      if (sc.mode === 'map') {
        const p = this.pMap;
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(p.p);
        // Карта «накрывает» экран, как обои, и медленно плывёт
        const ar = W / H, mar = sc.w / sc.h;
        let sx = 1, sy = 1;
        if (ar > mar) sy = mar / ar;
        else sx = ar / mar;
        const zoom = this.peeking ? 1 : 0.82;
        sx *= zoom; sy *= zoom;
        const ox = (1 - sx) / 2 + Math.sin(tm * 0.021) * (1 - sx) * 0.45;
        const oy = (1 - sy) / 2 + Math.cos(tm * 0.017) * (1 - sy) * 0.45;
        this.view = [ox, oy, sx, sy];
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.uniform1i(p.u.uTex, 0);
        gl.uniform2f(p.u.uRes, W, H);
        gl.uniform2f(p.u.uTexel, 1 / sc.w, 1 / sc.h);
        gl.uniform4f(p.u.uView, ox, oy, sx, sy);
        gl.uniform1f(p.u.uTime, tm);
        gl.uniform1f(p.u.uNight, L.night * 0.8);
        const mk = new Float32Array(64);
        const TYPES = { city: 0, village: 1, castle: 2, lighthouse: 3, label: 4 };
        sc.marks.slice(0, 16).forEach((m, i) => mk.set([m.x, m.y, TYPES[m.type], 0], i * 4));
        gl.uniform4fv(p.u.uMk, mk);
        gl.uniform1i(p.u.uMkN, Math.min(16, sc.marks.length));
        quad(p);
      } else {
        // Небо
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(this.pSky.p);
        const su = this.pSky.u;
        gl.uniform3fv(su.uSky, L.sky);
        gl.uniform3fv(su.uFog, L.fog);
        gl.uniform1f(su.uNight, L.night);
        gl.uniform1f(su.uTime, tm);
        quad(this.pSky);
        // Кубики
        const g = sc.g, p = this.pVox, u = p.u;
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(p.p);
        const yaw = this.yaw + (this.drag ? 0 : tm * 0.045);
        this.curYaw = yaw;
        const ar = W / H, dist = (ar < 1 ? 78 / ar : 70) * (this.peeking ? 0.92 : 1);
        const cx = g.N / 2, cz = g.N / 2, cy = g.SEA + 2;
        const eye = [cx + Math.cos(yaw) * dist, cy + dist * 0.62, cz + Math.sin(yaw) * dist];
        const proj = M4.persp(0.62, ar, 1, 400);
        const mvp = M4.mul(proj, M4.look(eye, [cx, cy, cz], [0, 1, 0]));
        this.mvp = mvp;
        gl.uniformMatrix4fv(u.uMVP, false, new Float32Array(mvp));
        gl.uniform1f(u.uTime, tm);
        gl.uniform3fv(u.uSun, norm(L.sun));
        gl.uniform3fv(u.uSunCol, L.sunCol);
        gl.uniform3fv(u.uSky, L.sky);
        gl.uniform3fv(u.uGround, L.ground);
        gl.uniform3fv(u.uFog, L.fog);
        gl.uniform1f(u.uFogD, dist * 1.9);
        gl.uniform1f(u.uNight, L.night);
        const attr = (name, buf, size, type, normz) => {
          const loc = gl.getAttribLocation(p.p, name);
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, type, normz, 0, 0);
          return loc;
        };
        const l1 = attr('aPos', this.bPos, 3, gl.FLOAT, false);
        const l2 = attr('aCol', this.bCol, 4, gl.UNSIGNED_BYTE, true);
        const l3 = attr('aInf', this.bInf, 4, gl.UNSIGNED_BYTE, false);
        gl.drawArrays(gl.TRIANGLES, 0, sc.count);
        [l1, l2, l3].forEach((l) => gl.disableVertexAttribArray(l));
      }
      if (this.peeking) this.placeLabels();
    },

    /* --- «Посмотреть мир»: прячем интерфейс, мир на весь экран --- */
    peek(on) {
      this.peeking = !!on;
      document.documentElement.classList.toggle('world-peek', this.peeking);
      if (!this.peekEl) {
        if (!on) return;
        this.peekEl = App.el(`<div class="world-peek-ui"><div class="wp-labels"></div><div class="wp-card"></div></div>`);
        document.body.appendChild(this.peekEl);
        this.peekEl.addEventListener('click', (e) => {
          const b = e.target.closest('[data-wp]');
          if (!b) return;
          if (b.dataset.wp === 'close') this.peek(false);
          else if (b.dataset.wp === 'rebuild') this.rebuild(true);
        });
        // Перетаскивание мышью вращает диораму
        this.peekEl.addEventListener('pointerdown', (e) => {
          if (e.target.closest('.wp-card') || !this.scene || this.scene.mode !== 'diorama') return;
          this.drag = { x: e.clientX, yaw: this.curYaw };
          this.peekEl.setPointerCapture(e.pointerId);
          this.kick();
        });
        this.peekEl.addEventListener('pointermove', (e) => {
          if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.008 - (this.time || 0) * 0.045 * 0;
        });
        this.peekEl.addEventListener('pointerup', () => {
          if (this.drag) this.yaw = this.curYaw - (this.time || 0) * 0.045;
          this.drag = null;
        });
        this.onKey = (e) => e.key === 'Escape' && this.peeking && this.peek(false);
        document.addEventListener('keydown', this.onKey);
      }
      this.peekEl.classList.toggle('hidden', !this.peeking);
      this.resize();
      this.renderPeek();
      this.kick();
    },

    renderPeek() {
      if (!this.peeking || !this.peekEl || !this.facts) return;
      const f = this.facts, ru = App.lang !== 'en';
      const FN = FNAME[ru ? 'ru' : 'en'];
      const found = Object.keys(f.cnt).sort((a, b) => f.cnt[b] - f.cnt[a]);
      const chips = found.length
        ? found.map((k) => `<span class="wp-chip">${FN[k]} <b>×${f.cnt[k]}</b></span>`).join('')
        : `<span class="wp-empty">${t('world_nothing')}</span>`;
      const dirs = Object.keys(f.dir).filter((k) => FN[k]).map((k) => `<li><b>${FN[k]}</b> — ${DIRNAME(f.dir[k])}</li>`).join('');
      const scale = [];
      if (f.counts.continent) scale.push(t('world_cont', { n: f.counts.continent }));
      else if (f.mm.continent) scale.push(t('world_cont_any'));
      if (f.counts.island) scale.push(t('world_isl', { n: f.counts.island }));
      if (f.maxKm) scale.push(t('world_km', { n: App.fmt(f.maxKm) }));
      if (f.mm.realm) scale.push(t('world_realm'));
      const st = this.stats || {};
      this.peekEl.querySelector('.wp-card').innerHTML = `
        <div class="wp-head"><span class="wp-ic">${App.icon('globe')}</span><div><div class="wp-title">${t('world_title')}</div>
          <div class="wp-mode">${t(f.mode === 'map' ? 'world_mode_map' : 'world_mode_dio')} · ${t('world_time_' + f.time)}</div></div></div>
        <div class="wp-lbl">${t('world_found')}</div><div class="wp-chips">${chips}</div>
        ${dirs ? `<div class="wp-lbl">${t('world_where')}</div><ul class="wp-dirs">${dirs}</ul>` : ''}
        ${scale.length ? `<div class="wp-lbl">${t('world_scale')}</div><div class="wp-scale">${scale.join(' · ')}</div>` : ''}
        ${f.names.length ? `<div class="wp-lbl">${t('world_names')}</div><div class="wp-scale">${f.names.map((n) => App.esc(n.name)).join(', ')}</div>` : ''}
        <div class="wp-stats">${t('world_stats', { ms: st.ms || 0, kb: Math.round((st.bytes || 0) / 1024), f: st.faces ? App.fmt(st.faces) : '—' })}</div>
        <div class="wp-hint">${t(f.mode === 'map' ? 'world_hint_map' : 'world_hint_dio')}</div>
        <div class="wp-btns"><button class="btn sm" data-wp="rebuild">${App.icon('reset')}${t('world_rebuild')}</button><button class="btn sm primary" data-wp="close">${t('close')}</button></div>`;
      this.labelEls = null;
    },

    // Подписи на карте/диораме: переводим координаты мира в пиксели экрана
    placeLabels() {
      const sc = this.scene;
      const box = this.peekEl && this.peekEl.querySelector('.wp-labels');
      if (!box || !sc) return;
      const FN = FNAME[App.lang !== 'en' ? 'ru' : 'en'];
      const items = sc.mode === 'map' ? sc.marks.filter((m) => m.name || m.type !== 'label') : sc.g.labels;
      if (!this.labelEls || this.labelEls.length !== items.length) {
        box.innerHTML = items.map((m) => `<span class="wl ${sc.mode === 'map' ? 'wl-map' : ''}">${App.esc(m.name || FN[m.type || m.key] || '')}</span>`).join('');
        this.labelEls = [...box.children];
      }
      const W = innerWidth, H = innerHeight;
      items.forEach((m, i) => {
        let x, y, vis = true;
        if (sc.mode === 'map') {
          const [ox, oy, sx, sy] = this.view;
          x = ((m.x - ox) / sx) * W;
          y = ((m.y - oy) / sy) * H;
        } else {
          const v = this.mvp, p = [m.x + 0.5, m.y, m.z + 0.5];
          const cx = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12];
          const cy = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13];
          const cw = v[3] * p[0] + v[7] * p[1] + v[11] * p[2] + v[15];
          vis = cw > 0;
          x = (cx / cw * 0.5 + 0.5) * W;
          y = (1 - (cy / cw * 0.5 + 0.5)) * H;
        }
        const el = this.labelEls[i];
        el.style.transform = `translate(${x | 0}px, ${y | 0}px) translate(-50%, -130%)`;
        el.style.opacity = vis && x > 0 && x < W && y > 0 && y < H ? 1 : 0;
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

    // Для проверки из консоли: построить мир по любому тексту
    _analyze: analyze,
  };
})();
