(() => {
  'use strict';

  const DATA = window.HOSHANOT_DATA;
  const $ = (id) => document.getElementById(id);

  // ── הגדרות שמורות (localStorage עלול להיות חסום — תמיד עם גיבוי) ──
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('hoshanot.' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('hoshanot.' + k, JSON.stringify(v)); } catch { /* ignore */ }
    },
  };

  // ── מדידת שימוש (GoatCounter — בלי עוגיות ובלי מידע אישי) ──
  // שם החשבון ב-goatcounter.com (למשל 'hoshanot' עבור hoshanot.goatcounter.com). ריק = המדידה כבויה.
  const GOATCOUNTER_CODE = 'danielohayon85';

  const analytics = (() => {
    const queue = [];
    const sent = new Set();
    const ready = () => window.goatcounter && typeof window.goatcounter.count === 'function';
    function flush() { while (ready() && queue.length) window.goatcounter.count(queue.shift()); }
    if (GOATCOUNTER_CODE && location.protocol.startsWith('http')) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://gc.zgo.at/count.js';
      s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
      s.onload = flush;
      document.head.append(s);
    }
    return {
      // אירוע נספר פעם אחת בכל טעינת דף, כדי שהמספרים ישקפו "כמה אנשים" ולא "כמה לחיצות"
      event(path, title) {
        if (!GOATCOUNTER_CODE || sent.has(path)) return;
        sent.add(path);
        queue.push({ path, title: title || path, event: true });
        flush();
      },
    };
  })();

  const NUSACHIM = ['ashkenaz', 'sefard', 'edot'];
  const FONT_SIZES = [20, 22, 24, 26, 28, 31, 34, 38, 42, 47, 52];
  const SPEED_MIN = 1, SPEED_MAX = 15;

  // סדר ההושענות לאשכנז ולספרד, לפי היום בשבוע שבו חל יום טוב ראשון (0=ראשון … 6=שבת).
  // סוכות חל רק בימים ב', ג', ה' ושבת (לא אד"ו ראש).
  const ORDER = {
    1: ['amitecha', 'even', 'eeroch', 'om_ani', 'el', 'shabbat'],
    2: ['amitecha', 'even', 'eeroch', 'el', 'shabbat', 'adon'],
    4: ['amitecha', 'even', 'shabbat', 'eeroch', 'el', 'adon'],
    6: ['shabbat', 'amitecha', 'eeroch', 'even', 'el', 'adon'],
  };

  const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'הו״ר'];
  const WEEKDAY_SHORT = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];
  const WEEKDAY_LONG = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת קודש'];
  const ORDINAL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי'];

  // ── תאריכים ──
  const atNoon = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return atNoon(x); };
  const hebFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' });

  function hebParts(d) {
    const parts = hebFmt.formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return { day: parseInt(get('day'), 10), month: get('month'), year: parseInt(get('year') || get('relatedYear'), 10) };
  }
  const isTishri = (m) => /^tis?hri/i.test(m);

  function findSukkot(today) {
    const h = hebParts(today);
    if (isTishri(h.month) && h.day >= 15 && h.day <= 21) {
      return { day1: addDays(today, 15 - h.day), current: h.day - 14, year: h.year };
    }
    for (let i = 1; i <= 400; i++) {
      const d = addDays(today, i);
      const x = hebParts(d);
      if (isTishri(x.month) && x.day === 15) return { day1: d, current: null, daysUntil: i, year: x.year };
    }
    return null;
  }

  function gematria(n) {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
    let s = hundreds[Math.floor(n / 100)];
    const r = n % 100;
    s += r === 15 ? 'טו' : r === 16 ? 'טז' : tens[Math.floor(r / 10)] + ones[r % 10];
    return s.length > 1 ? s.slice(0, -1) + '״' + s.slice(-1) : s + '׳';
  }

  // ── מצב ──
  const today = atNoon(new Date());
  const sukkot = findSukkot(today);
  const state = {
    nusach: NUSACHIM.includes(store.get('nusach')) ? store.get('nusach') : 'ashkenaz',
    day: sukkot && sukkot.current ? sukkot.current : 1,
    font: clamp(store.get('font', 4), 0, FONT_SIZES.length - 1),
    speed: clamp(store.get('speed', 5), SPEED_MIN, SPEED_MAX),
    guide: store.get('guide', true),
    wake: store.get('wake', true),
    theme: store.get('theme', 'auto'),
  };

  function clamp(v, a, b) { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : a; }

  const weekdayOf = (n) => addDays(sukkot.day1, n - 1).getDay();

  function serviceKey(n) {
    if (n === 7) return 'hr';
    const w = weekdayOf(n);
    if (state.nusach === 'edot') return w === 6 ? 'shabbat' : 'd' + n;
    return ORDER[sukkot.day1.getDay()][n - 1];
  }

  function dayDescription(n) {
    const w = weekdayOf(n);
    if (n === 7) return 'הושענא רבה';
    if (n === 1) return 'יום טוב ראשון של סוכות' + (w === 6 ? ' · שבת' : '');
    return `יום ${ORDINAL[n - 1]} של סוכות` + (w === 6 ? ' · שבת חול המועד' : '');
  }

  // ── כותרת ──
  function renderHero() {
    const n = state.day;
    const svc = DATA.nusachim[state.nusach].services[serviceKey(n)];
    const isToday = sukkot.current === n;
    $('todayLine').textContent = (isToday ? 'היום · ' : '') + dayDescription(n);
    $('piyutTitle').textContent = svc.title;
    const date = addDays(sukkot.day1, n - 1);
    $('hebDate').textContent =
      `${WEEKDAY_LONG[date.getDay()]} · ${gematria(14 + n)} בתשרי ${gematria(sukkot.year % 1000)} · ` +
      date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
    document.title = `הושענות · ${svc.title.replace(/[֑-ׇ]/g, '')}`;

    const notice = $('notice');
    if (!sukkot.current) {
      const d1 = sukkot.day1.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
      notice.textContent = `סוכות ${gematria(sukkot.year % 1000)} יחול בעוד ${sukkot.daysUntil} ימים (${d1}). ` +
        'בינתיים אפשר לעיין בהושענות של כל יום.';
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
  }

  function renderNusachPicker() {
    const el = $('nusachPicker');
    el.innerHTML = '';
    for (const key of NUSACHIM) {
      const b = document.createElement('button');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(key === state.nusach));
      b.textContent = DATA.nusachim[key].name;
      b.addEventListener('click', () => {
        if (state.nusach === key) return;
        state.nusach = key;
        store.set('nusach', key);
        analytics.event('nusach-' + key, 'נוסח: ' + DATA.nusachim[key].name);
        refresh();
        toast('נוסח ' + DATA.nusachim[key].name);
      });
      el.append(b);
    }
  }

  function renderDayPicker() {
    const el = $('dayPicker');
    el.innerHTML = '';
    for (let n = 1; n <= 7; n++) {
      const b = document.createElement('button');
      b.className = 'day' + (sukkot.current === n ? ' is-today' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(n === state.day));
      b.setAttribute('aria-label', dayDescription(n));
      b.innerHTML = `<b>${DAY_LETTERS[n - 1]}</b><small>${WEEKDAY_SHORT[weekdayOf(n)]}</small>`;
      b.addEventListener('click', () => {
        if (state.day === n) return;
        state.day = n;
        refresh();
      });
      el.append(b);
    }
  }

  // ── טקסט ──
  const ACROSTIC = /^([א-ת][֑-ׇ]*)/;
  let sections = [];

  function renderReader() {
    const svc = DATA.nusachim[state.nusach].services[serviceKey(state.day)];
    const reader = $('reader');
    const frag = document.createDocumentFragment();
    sections = [];
    for (const [type, value] of svc.blocks) {
      let el;
      if (type === 's') {
        el = document.createElement('p');
        el.className = 'piyut';
        for (const st of value) {
          const span = document.createElement('span');
          span.className = 'st';
          const refrain = st.replace(/[\u0591-\u05C7]/g, '').startsWith('הושע נא');
          span.innerHTML = refrain ? st : st.replace(ACROSTIC, '<span class="ac">$1</span>');
          el.append(span);
        }
      } else if (type === 'h') {
        el = document.createElement('h2');
        el.className = 'sec';
        el.id = 'sec-' + sections.length;
        el.textContent = value;
        sections.push({ id: el.id, title: value });
      } else {
        el = document.createElement('p');
        el.className = { n: 'note', r: 'refrain', p: 'txt' }[type] || 'txt';
        el.innerHTML = value; // נוצר ב-build ומכיל רק <br>/<small>
      }
      frag.append(el);
    }
    const end = document.createElement('div');
    end.className = 'end';
    end.innerHTML = `<strong>סוף ההושענות</strong>נוסח ${DATA.nusachim[state.nusach].name} · מקור: ${DATA.nusachim[state.nusach].source}`;
    frag.append(end);
    reader.replaceChildren(frag);
    renderSections();
  }

  function renderSections() {
    const box = $('sections');
    const list = $('sectionsList');
    list.innerHTML = '';
    box.classList.toggle('hidden', sections.length === 0);
    for (const s of sections) {
      const b = document.createElement('button');
      b.textContent = s.title;
      b.addEventListener('click', () => {
        closeSheet();
        document.getElementById(s.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      list.append(b);
    }
  }

  function refresh() {
    stop();
    renderHero();
    renderNusachPicker();
    renderDayPicker();
    renderReader();
    window.scrollTo(0, 0);
    updateProgress();
  }

  // ── גופן ──
  function applyFont() {
    document.documentElement.style.setProperty('--text-size', FONT_SIZES[state.font] + 'px');
    $('fontDown').disabled = state.font === 0;
    $('fontUp').disabled = state.font === FONT_SIZES.length - 1;
  }
  function changeFont(delta) {
    // שומרים על המקום בטקסט: מודדים את היחס לפני ואחרי
    const ratio = window.scrollY / Math.max(1, document.documentElement.scrollHeight);
    state.font = clamp(state.font + delta, 0, FONT_SIZES.length - 1);
    store.set('font', state.font);
    applyFont();
    const y = ratio * document.documentElement.scrollHeight;
    window.scrollTo(0, y);
    pos = y;
  }

  // ── מהירות ──
  // פיקסלים לשנייה עבור גופן 28px; משתנה יחד עם גודל הגופן כך ש"שורות לדקה" נשמר.
  const pxPerSec = () => 6 * Math.pow(1.28, state.speed - 1) * (FONT_SIZES[state.font] / 28);

  function applySpeed() {
    $('speedValue').textContent = state.speed;
    $('slower').disabled = state.speed === SPEED_MIN;
    $('faster').disabled = state.speed === SPEED_MAX;
  }
  function setSpeed(v) {
    state.speed = clamp(v, SPEED_MIN, SPEED_MAX);
    store.set('speed', state.speed);
    applySpeed();
  }

  // ── גלילה אוטומטית ──
  let playing = false;
  let raf = 0;
  let last = 0;
  let pos = 0;
  let holding = false;       // המשתמש נוגע במסך / גולל ידנית
  let holdUntil = 0;

  function readerStart() {
    return $('reader').getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.28;
  }

  function play() {
    if (playing) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= max - 2) window.scrollTo(0, readerStart());
    playing = true;
    analytics.event('scroll-play', 'הפעלת גלילה');
    analytics.event('scroll-speed-' + state.speed, 'מהירות התחלתית: ' + state.speed);
    $('playBtn').setAttribute('aria-pressed', 'true');
    $('playBtn').setAttribute('aria-label', 'עצירת גלילה');
    $('playCap').textContent = 'עצירה';
    $('guide').classList.toggle('hidden', !state.guide);
    requestWake();

    const start = readerStart();
    if (window.scrollY < start - 4) {
      // מהכותרת — גלישה חלקה לתחילת הטקסט ואז גלילה איטית
      window.scrollTo({ top: start, behavior: 'smooth' });
      holdUntil = performance.now() + 700;
    }
    pos = window.scrollY;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(raf);
    $('playBtn').setAttribute('aria-pressed', 'false');
    $('playBtn').setAttribute('aria-label', 'התחלת גלילה');
    $('playCap').textContent = 'גלילה';
    $('guide').classList.add('hidden');
    releaseWake();
  }

  const toggle = () => (playing ? stop() : play());

  function tick(now) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (holding || now < holdUntil) {
      pos = window.scrollY;
    } else {
      if (Math.abs(window.scrollY - pos) > 3) pos = window.scrollY; // גלילה ידנית באמצע
      pos += pxPerSec() * dt;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (pos >= max) {
        window.scrollTo(0, max);
        stop();
        return;
      }
      window.scrollTo(0, pos);
    }
    raf = requestAnimationFrame(tick);
  }

  function flash() {
    const f = $('tapFlash');
    f.innerHTML = playing
      ? '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
    f.classList.remove('show');
    void f.offsetWidth;
    f.classList.add('show');
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('hidden');
    void t.offsetWidth;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 1700);
  }

  // ── מסך דלוק ──
  let wakeLock = null;
  async function requestWake() {
    if (!state.wake || !('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { wakeLock = null; }
  }
  function releaseWake() {
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && playing) {
      last = performance.now();
      requestWake();
    }
  });

  // ── התקדמות ──
  function updateProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    $('progressBar').style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + '%';
  }

  // ── גיליון אפשרויות ──
  function openSheet() {
    $('sheet').classList.remove('hidden');
    $('sheetBackdrop').classList.remove('hidden');
    $('moreBtn').setAttribute('aria-expanded', 'true');
  }
  function closeSheet() {
    $('sheet').classList.add('hidden');
    $('sheetBackdrop').classList.add('hidden');
    $('moreBtn').setAttribute('aria-expanded', 'false');
  }

  function applyTheme() {
    if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', state.theme);
    for (const b of $('themePicker').querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b.dataset.theme === state.theme));
    }
  }

  // ── אירועים ──
  function bind() {
    $('playBtn').addEventListener('click', toggle);
    $('slower').addEventListener('click', () => setSpeed(state.speed - 1));
    $('faster').addEventListener('click', () => setSpeed(state.speed + 1));
    $('fontDown').addEventListener('click', () => changeFont(-1));
    $('fontUp').addEventListener('click', () => changeFont(1));
    $('moreBtn').addEventListener('click', () => ($('sheet').classList.contains('hidden') ? openSheet() : closeSheet()));
    $('sheetBackdrop').addEventListener('click', closeSheet);


    // לחיצה על הטקסט — עצירה/המשך (גרירה לגלילה אינה נחשבת לחיצה)
    $('reader').addEventListener('click', () => {
      if (String(window.getSelection() || '').length) return;
      toggle();
      flash();
    });

    const hold = () => { holding = true; };
    const release = () => { holding = false; pos = window.scrollY; };
    window.addEventListener('touchstart', hold, { passive: true });
    window.addEventListener('touchend', release, { passive: true });
    window.addEventListener('touchcancel', release, { passive: true });
    window.addEventListener('wheel', () => { holdUntil = performance.now() + 600; }, { passive: true });
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);

    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); toggle(); flash(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSpeed(state.speed + 1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSpeed(state.speed - 1); }
      else if (e.key === 'Escape') closeSheet();
    });

    const guide = $('guideToggle');
    guide.checked = state.guide;
    guide.addEventListener('change', () => {
      state.guide = guide.checked;
      store.set('guide', state.guide);
      $('guide').classList.toggle('hidden', !(playing && state.guide));
    });

    const wake = $('wakeToggle');
    if (!('wakeLock' in navigator)) {
      wake.closest('.row').classList.add('hidden');
    }
    wake.checked = state.wake;
    wake.addEventListener('change', () => {
      state.wake = wake.checked;
      store.set('wake', state.wake);
      if (state.wake && playing) requestWake(); else releaseWake();
    });

    for (const b of $('themePicker').querySelectorAll('button')) {
      b.addEventListener('click', () => { state.theme = b.dataset.theme; store.set('theme', state.theme); applyTheme(); });
    }

    const fs = $('fullscreenBtn');
    if (!document.fullscreenEnabled) fs.classList.add('hidden');
    fs.addEventListener('click', () => {
      closeSheet();
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      fs.textContent = document.fullscreenElement ? 'יציאה ממסך מלא' : 'מסך מלא';
    });

    $('topBtn').addEventListener('click', () => {
      closeSheet();
      stop();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── אתחול ──
  if (!DATA || !sukkot) {
    document.body.innerHTML = '<p style="padding:2rem;text-align:center">לא ניתן לטעון את ההושענות.</p>';
    return;
  }
  applyTheme();
  applyFont();
  applySpeed();
  bind();
  refresh();

  analytics.event('nusach-' + state.nusach, 'נוסח: ' + DATA.nusachim[state.nusach].name);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) analytics.event('open-installed', 'פתיחה מאפליקציה מותקנת');
  window.addEventListener('appinstalled', () => analytics.event('installed', 'התקנה במסך הבית'));

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
