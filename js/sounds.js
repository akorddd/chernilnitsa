'use strict';
/* =========================================================
   Звуки для фокуса: дождь, море, камин, кафе.
   Ни одного звукового файла — всё синтезируется из шума
   прямо в браузере (Web Audio API), поэтому сайт не тяжелеет.
   ========================================================= */
(function () {
  const App = window.App;
  const t = (k, v) => App.t(k, v);
  const $ = App.$;
  const KEY = 'chernilnitsa.sound';
  const rnd = (a, b) => a + Math.random() * (b - a);

  App.SOUNDS = [
    { id: 'rain', icon: 'rain' },
    { id: 'sea', icon: 'waves' },
    { id: 'fire', icon: 'flame' },
    { id: 'cafe', icon: 'coffee' },
  ];

  App.Ambience = {
    s: { id: 'rain', vol: 0.5, withFocus: false },
    ctx: null,
    playing: null,
    bufs: {},
    timers: new Set(),
    nodes: [],

    /* --- Основа: аудиоконтекст и шумы --- */
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.master.gain.value = this.s.vol * this.s.vol; // ухо слышит громкость «по квадрату»
    },
    // 3 секунды шума, дальше он крутится по кругу. Моно — вдвое меньше памяти
    buf(kind) {
      if (this.bufs[kind]) return this.bufs[kind];
      const sr = this.ctx.sampleRate,
        n = sr * 3;
      const b = this.ctx.createBuffer(1, n, sr);
      const d = b.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w;
        else if (kind === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099;
          b1 = 0.963 * b1 + w * 0.2965;
          b2 = 0.57 * b2 + w * 1.0527;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        } else {
          last = (last + 0.02 * w) / 1.02; // «коричневый» шум — глухой гул
          d[i] = last * 3.5;
        }
      }
      return (this.bufs[kind] = b);
    },
    keep(n) {
      this.nodes.push(n);
      return n;
    },
    noise(kind) {
      const s = this.keep(this.ctx.createBufferSource());
      s.buffer = this.buf(kind);
      s.loop = true;
      s.start(0, rnd(0, 2.5));
      return s;
    },
    filter(type, freq, q) {
      const f = this.keep(this.ctx.createBiquadFilter());
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      return f;
    },
    gain(v) {
      const g = this.keep(this.ctx.createGain());
      g.gain.value = v;
      return g;
    },
    chain(...n) {
      for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]);
      return n[n.length - 1];
    },
    // Повторять событие со случайной паузой, пока звук играет
    // Таймеры храним в Set и убираем сработавшие — иначе за час набежали бы десятки тысяч
    loop(minMs, maxMs, fn) {
      let id;
      const run = () => {
        this.timers.delete(id);
        if (!this.playing) return;
        fn();
        id = setTimeout(run, rnd(minMs, maxMs));
        this.timers.add(id);
      };
      id = setTimeout(run, rnd(minMs, maxMs));
      this.timers.add(id);
    },
    // Короткий щелчок/капля: кусочек шума через полосовой фильтр
    burst(out, freq, dur, vol) {
      const c = this.ctx,
        now = c.currentTime;
      const s = c.createBufferSource();
      s.buffer = this.buf('white');
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 1.2;
      const g = c.createGain();
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      s.connect(f).connect(g);
      if (p) {
        p.pan.value = rnd(-0.8, 0.8);
        g.connect(p).connect(out);
      } else g.connect(out);
      s.start(now, rnd(0, 2.5), dur + 0.02);
    },
    // Звон чашки: несколько синусов, быстро затухают
    clink(out) {
      const c = this.ctx,
        now = c.currentTime,
        base = rnd(2200, 3400);
      [1, 1.47, 2.09].forEach((k, i) => {
        const o = c.createOscillator(),
          g = c.createGain();
        o.frequency.value = base * k;
        g.gain.setValueAtTime(0.025 / (i + 1), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + rnd(0.25, 0.6));
        o.connect(g).connect(out);
        o.start(now);
        o.stop(now + 0.7);
      });
    },

    /* --- Рецепты звуков --- */
    rain(out) {
      this.chain(this.noise('pink'), this.filter('highpass', 400), this.filter('lowpass', 6500), this.gain(0.75), out);
      this.chain(this.noise('white'), this.filter('bandpass', 2600, 0.6), this.gain(0.07), out);
      this.loop(25, 90, () => Math.random() < 0.55 && this.burst(out, rnd(2500, 7000), rnd(0.008, 0.03), rnd(0.03, 0.14)));
    },
    sea(out) {
      const body = this.gain(0.2),
        foam = this.gain(0.02);
      this.chain(this.noise('brown'), this.filter('lowpass', 520), body, out);
      this.chain(this.noise('white'), this.filter('highpass', 1800), foam, out);
      const wave = () => {
        const now = this.ctx.currentTime,
          up = rnd(2.5, 3.8),
          down = rnd(3.5, 5.5),
          peak = rnd(0.7, 1);
        [
          [body.gain, 0.18, peak],
          [foam.gain, 0.01, peak * 0.09],
        ].forEach(([p, lo, hi]) => {
          p.cancelScheduledValues(now);
          p.setValueAtTime(p.value, now);
          p.linearRampToValueAtTime(hi, now + up);
          p.linearRampToValueAtTime(lo, now + up + down);
        });
      };
      wave();
      this.loop(6500, 10000, wave);
    },
    fire(out) {
      const roar = this.gain(0.55);
      this.chain(this.noise('brown'), this.filter('lowpass', 260), roar, out);
      this.loop(400, 900, () => roar.gain.setTargetAtTime(rnd(0.35, 0.7), this.ctx.currentTime, 0.3));
      this.loop(30, 120, () => {
        if (Math.random() < 0.35) this.burst(out, rnd(1500, 5500), rnd(0.004, 0.02), rnd(0.05, 0.3));
        if (Math.random() < 0.02) this.burst(out, rnd(800, 1500), 0.05, 0.5); // громкий «треск»
      });
    },
    cafe(out) {
      this.chain(this.noise('brown'), this.filter('lowpass', 220), this.gain(0.18), out);
      const talk = this.gain(0.25);
      this.chain(this.noise('pink'), this.filter('bandpass', 650, 0.7), talk, out);
      const talk2 = this.gain(0.12);
      this.chain(this.noise('pink'), this.filter('bandpass', 1400, 1.2), talk2, out);
      // Гул голосов «дышит»: громкость всё время немного меняется
      this.loop(180, 450, () => {
        const now = this.ctx.currentTime;
        talk.gain.setTargetAtTime(rnd(0.12, 0.35), now, 0.12);
        talk2.gain.setTargetAtTime(rnd(0.04, 0.16), now, 0.08);
      });
      this.loop(2500, 7000, () => this.clink(out));
    },

    /* --- Управление --- */
    play(id) {
      this.stop(true);
      this.ensure();
      this.playing = id;
      const now = this.ctx.currentTime;
      this.out = this.ctx.createGain();
      this.out.gain.setValueAtTime(0, now);
      this.out.gain.linearRampToValueAtTime(1, now + 1.5); // плавное появление
      this.out.connect(this.master);
      this[id](this.out);
      this.set({ id });
    },
    stop(instant) {
      this.timers.forEach(clearTimeout);
      this.timers.clear();
      const nodes = this.nodes,
        out = this.out;
      this.nodes = [];
      this.out = null;
      this.playing = null;
      const kill = () => {
        nodes.forEach((n) => {
          try {
            if (n.stop) n.stop();
            n.disconnect();
          } catch (e) {}
        });
        if (out) out.disconnect();
      };
      if (out && !instant) {
        const now = this.ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + 0.5);
        setTimeout(kill, 600);
      } else kill();
      this.render();
    },
    toggle(id) {
      if (this.playing === id) this.stop();
      else this.play(id);
      this.render();
    },
    set(p) {
      Object.assign(this.s, p);
      App.lsSet(KEY, JSON.stringify(this.s));
    },

    render() {
      const btn = $('.amb-btn');
      if (btn) {
        btn.classList.toggle('on', !!this.playing);
        $('.amb-label').textContent = this.playing ? t('snd_' + this.playing) : '';
      }
      $('.amb-float').classList.toggle('on', !!this.playing);
      if (this.pop.classList.contains('hidden')) return;
      this.pop.innerHTML = `
        <div class="pop-title">${t('snd_title')}</div>
        <div class="pop-sub">${t('snd_sub')}</div>
        <div class="snd-grid">${App.SOUNDS.map(
          (x) => `<button class="snd ${this.playing === x.id ? 'on' : ''}" data-snd="${x.id}">${App.icon(x.icon)}<span>${t('snd_' + x.id)}</span><i class="eq"><b></b><b></b><b></b></i></button>`
        ).join('')}</div>
        <label class="snd-vol">${App.icon('volume')}<input type="range" min="0" max="100" step="1" value="${Math.round(this.s.vol * 100)}"></label>
        <label class="th-opt"><span>${t('snd_focus')}<small>${t('snd_focus_hint')}</small></span>
          <span class="switch"><input type="checkbox" data-o="withFocus" ${this.s.withFocus ? 'checked' : ''}><i></i></span></label>`;
    },
    open(anchor) {
      const pop = this.pop;
      const open = pop.classList.contains('hidden');
      pop.classList.toggle('hidden', !open);
      if (!open) return;
      this.render();
      const r = anchor.getBoundingClientRect();
      pop.style.bottom = innerHeight - r.top + 8 + 'px';
      if (r.left < innerWidth / 2) {
        pop.style.left = Math.max(8, r.left) + 'px';
        pop.style.right = 'auto';
      } else {
        pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
        pop.style.left = 'auto';
      }
    },

    init() {
      try {
        Object.assign(this.s, JSON.parse(App.lsGet(KEY) || '{}'));
      } catch (e) {}
      this.pop = $('.amb-pop');
      [$('.amb-btn'), $('.amb-float')].forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.open(b);
        })
      );
      this.pop.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = e.target.closest('[data-snd]');
        if (b) this.toggle(b.dataset.snd);
      });
      this.pop.addEventListener('input', (e) => {
        if (e.target.type !== 'range') return;
        this.set({ vol: e.target.value / 100 });
        if (this.ctx) this.master.gain.setTargetAtTime(this.s.vol * this.s.vol, this.ctx.currentTime, 0.05);
      });
      this.pop.addEventListener('change', (e) => {
        if (e.target.dataset.o) this.set({ [e.target.dataset.o]: e.target.checked });
      });
      document.addEventListener('click', () => this.pop.classList.add('hidden'));
      // Режим фокуса: включить выбранный звук и выключить при выходе
      App.on('focus', (on) => {
        if (!this.s.withFocus) return;
        if (on && !this.playing) {
          this.play(this.s.id || 'rain');
          this.autoOn = true;
        } else if (!on && this.autoOn) {
          this.stop();
          this.autoOn = false;
        }
      });
      App.on('lang', () => this.render());
      this.render();
    },
  };
})();
