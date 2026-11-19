/* Novel AI landing: page-local behaviour.
   - the visitor's idea (three real Quick Prompt ideas from the app) carries through the page
   - scroll as quill: the peak act's --sc-p sets the story word by word behind a gold nib
   - Play choices answer
   - the ribbon opens the contents; the current chapter reads "Reading"
   The scrollcraft engine is mounted last and left untouched. */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------- stories --
  var STORIES = {
    poppy: {
      title: 'Poppy and the Sleepy Moon',
      genre: 'Bedtime, for kids',
      cover: 'cover-poppy-and-the-sleepy-moon',
      alt: 'Story cover: a house roof under a full moon',
      text: null, // the markup already holds it
      plan: ['The Yawn Behind the Cloud', 'Forty-One Sheep and a Duck', 'The Softest Blanket', 'Along the Rooftops', 'A Bed Behind the Hills'],
      planNow: 2,
      play: {
        tag: 'Play as Poppy, scene 2 of 5',
        text: 'The moon is far too big to carry, and the rooftops are slippery with dew. Somewhere below, the night train whistles twice.',
        choices: ['Ask the owls for help', 'Wave down the night train', 'Hum grandmother’s song'],
        out: [
          'Three owls drop from the chimney pots and take the corners of your blanket. The moon giggles. It has never been carried before.',
          'The driver leans out, tips his cap and makes room on the coal tender. The moon climbs aboard and falls asleep before the first bend.',
          'The tune drifts up the chimneys. One by one the stars stop twinkling and start to listen.'
        ]
      }
    },
    isla: {
      title: 'Isla Delmar and the Drowned Cities',
      genre: 'Adventure',
      cover: 'cover-isla-delmar-and-the-drowned-cities',
      alt: 'Story cover: a diver above a sunken city',
      text: [
        'Forty years after the seas rose, the old campus lay under ninety feet of green water, and Isla Delmar knew every stairwell of it by touch.',
        'She came up with the usual haul: two cases of antibiotics, a jar of seed corn, a compass that still worked. And one thing that was not usual at all.',
        'It was a chart of the drowned coast, folded into a waterproof sleeve. The ink was fresh. The date in the corner was this year.',
        'Someone had marked a facility off the old harbour wall, six hundred feet down, where nothing should be living.',
        'Someone had drawn it last month.'
      ],
      plan: ['The Chart in Fresh Ink', 'Ninety Feet of Green Water', 'The Harbour Wall', 'Six Hundred Feet Down', 'Whoever Is Living Below', 'The Trade'],
      planNow: 2,
      play: {
        tag: 'Play as Isla, scene 3 of 5',
        text: 'The chart says six hundred feet. Your air gauge says forty minutes. Below you, a light blinks on where no light should be.',
        choices: ['Dive now', 'Wait for the tide', 'Follow the fresh ink'],
        out: [
          'You let the weight take you. At three hundred feet the light blinks again, twice, as if it has seen you too.',
          'You surface and wait. By dusk a second boat has anchored at the harbour wall, flying no flag at all.',
          'The chart has a second fold you missed. Inside it, in the same fresh ink, is your own name.'
        ]
      }
    },
    aric: {
      title: 'The Last Mortal Oath',
      genre: 'Fantasy',
      cover: 'cover-arics-eternal-oath',
      alt: 'Story cover: a knight in a red cloak in a dark forest',
      text: [
        'For three hundred years the bell in the north tower had been silent, and for three hundred years Aric Thorne had not aged a day.',
        'Tonight it rang.',
        'The first note rolled down from the hills, low and patient, the way it had sounded on the morning he swore his oath. The saddle he was mending slipped from his hands.',
        'By the fifth note he could feel the cold again. Aric looked at his hands and saw, for the first time in three centuries, an old man’s lines beginning to arrive.',
        'The oath was ending. Something else was beginning.'
      ],
      plan: ['The Wound in Time', 'The Key in the Wreckage', 'A Dance of Ash', 'The Physician’s Refusal', 'The Hollow Meridian', 'The Oath Beyond Freedom'],
      planNow: 5,
      play: {
        tag: 'Play as Aric, chapter 2, scene 3 of 5',
        text: 'The bell stops. Somewhere below the tower, a door you sealed three hundred years ago swings open.',
        choices: ['Go down to the door', 'Ring the bell again', 'Follow the ash trail'],
        out: [
          'The stairs are warm. Halfway down you find bootprints in the dust, and they are yours, and they are fresh.',
          'The rope burns your palms. Across the valley a second bell answers, one you have never heard before.',
          'The ash leads out of the tower and into the old capital, to a house with its lamps already lit for you.'
        ]
      }
    }
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ------------------------------------------------------ scroll as quill --
  var writing = $('#create');
  var textEl = $('[data-story-text]');
  var rightPage = $('.book__page--right');
  var nib = $('.nib');
  var words = [];
  var shown = -1;

  // A page holds what fits on it. Paragraphs that would run past the page's foot are set
  // aside, so the story never spills out of the book on short or narrow screens.
  function fitPage() {
    var ps = $$('p', textEl);
    ps.forEach(function (p) {
      p.classList.remove('is-over');
      if (p.querySelector('.w')) p.textContent = p.textContent; // undo an earlier split
    });
    var shown = ps.filter(function (p) { return getComputedStyle(p).display !== 'none'; });
    var limit = textEl.getBoundingClientRect().bottom + 0.5;
    while (shown.length > 1 && shown[shown.length - 1].getBoundingClientRect().bottom > limit) {
      shown.pop().classList.add('is-over');
    }
  }

  function splitWords() {
    words = [];
    fitPage();
    $$('p', textEl).forEach(function (p) {
      if (getComputedStyle(p).display === 'none') return; // phones and short pages set fewer paragraphs
      var parts = p.textContent.split(/(\s+)/);
      p.textContent = '';
      parts.forEach(function (t) {
        if (!t) return;
        if (/^\s+$/.test(t)) { p.appendChild(document.createTextNode(t)); return; }
        var s = document.createElement('span');
        s.className = 'w';
        s.textContent = t;
        p.appendChild(s);
        words.push(s);
      });
    });
    shown = -1;
    paintWords(true);
  }

  function writingProgress() {
    var p = parseFloat(writing.style.getPropertyValue('--sc-p'));
    return isNaN(p) ? 0 : p;
  }

  var FRESH = 6;
  function paintWords(force) {
    var n = words.length;
    var k;
    if (reduce) k = n;
    else {
      var f = (writingProgress() - 0.08) / 0.72;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      k = Math.round(f * n);
    }
    if (k === shown && !force) return;
    for (var i = 0; i < n; i++) {
      var w = words[i];
      var on = i < k;
      if (w._on !== on) { w.classList.toggle('is-on', on); w._on = on; }
      var fresh = on && i >= k - FRESH && k < n;
      if (w._fr !== fresh) { w.classList.toggle('is-fresh', fresh); w._fr = fresh; }
    }
    shown = k;
    // the nib follows the last written word
    if (!nib) return;
    if (reduce || k === 0 || k >= n) { nib.classList.remove('is-on'); return; }
    var last = words[k - 1];
    var r = last.getBoundingClientRect();
    var pr = rightPage.getBoundingClientRect();
    nib.style.transform = 'translate3d(' + (r.right - pr.left + 2).toFixed(1) + 'px,' + (r.top - pr.top - 8).toFixed(1) + 'px,0)';
    nib.classList.add('is-on');
  }

  var writingLive = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { writingLive = es[0].isIntersecting; }, { rootMargin: '20% 0px' }).observe(writing);
  } else writingLive = true;
  function loop() {
    if (writingLive) paintWords(false);
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------ apply a story --
  function srcset(base) { return 'images/' + base + '-240.webp 240w, images/' + base + '.webp 480w'; }
  function setText(el, t) { if (el) el.textContent = t; }

  var poppyText = textEl.innerHTML; // the default, in the markup for no-JS and search

  function apply(key, first) {
    var s = STORIES[key] || STORIES.poppy;
    setText($('[data-story-title]'), s.title);
    setText($('[data-story-genre]'), s.genre);
    var img = $('[data-story-cover]');
    img.src = 'images/' + s.cover + '.webp';
    img.srcset = srcset(s.cover);
    img.alt = s.alt;
    if (s.text) {
      textEl.innerHTML = '';
      s.text.forEach(function (t) { var p = document.createElement('p'); p.textContent = t; textEl.appendChild(p); });
    } else textEl.innerHTML = poppyText;
    splitWords();

    // its book plan
    setText($('[data-plan-title]'), s.title);
    var list = $('[data-plan-list]');
    list.innerHTML = '';
    s.plan.forEach(function (t, i) {
      var li = document.createElement('li');
      var st = i < s.planNow ? 'Written' : i === s.planNow ? 'Writing' : 'Planned';
      if (i < s.planNow) li.className = 'is-done';
      if (i === s.planNow) li.className = 'is-now';
      li.innerHTML = '<span class="plan__t"></span><span class="plan__st"></span>';
      li.firstChild.textContent = t;
      li.lastChild.textContent = st;
      list.appendChild(li);
    });

    // its Play scene
    setText($('[data-play-tag]'), s.play.tag);
    setText($('[data-play-text]'), s.play.text);
    $$('[data-choice]').forEach(function (b, i) {
      b.setAttribute('aria-pressed', 'false');
      b.firstChild.nodeValue = s.play.choices[i];
    });
    var out = $('[data-play-out]');
    out.textContent = '';
    out.classList.remove('is-on');
    current = s;
    if (!first) { try { localStorage.setItem('novelai.seed', key); } catch (e) {} }
  }

  var current = STORIES.poppy;

  // Play choices
  $$('[data-choice]').forEach(function (b) {
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-choice');
      $$('[data-choice]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      var out = $('[data-play-out]');
      out.textContent = current.play.out[i];
      out.classList.add('is-on');
    });
  });

  // the seed
  var saved = null;
  try { saved = localStorage.getItem('novelai.seed'); } catch (e) {}
  if (saved && STORIES[saved]) {
    var r = $('input[name="seed"][value="' + saved + '"]');
    if (r) r.checked = true;
  }
  apply((saved && STORIES[saved]) ? saved : 'poppy', true);
  $$('input[name="seed"]').forEach(function (r) {
    r.addEventListener('change', function () { if (r.checked) apply(r.value, false); });
  });

  // ------------------------------------------------------------ contents --
  var ribbon = $('.ribbon');
  var dlg = $('#contents');
  function closeDlg() { if (dlg.open) dlg.close(); }
  ribbon.addEventListener('click', function () {
    if (dlg.open) { closeDlg(); return; }
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    ribbon.setAttribute('aria-expanded', 'true');
  });
  dlg.addEventListener('close', function () { ribbon.setAttribute('aria-expanded', 'false'); ribbon.focus(); });
  $('.contents__close').addEventListener('click', closeDlg);
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) {
      var b = dlg.getBoundingClientRect();
      if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) closeDlg();
    }
  });
  $$('.contents__list a').forEach(function (a) {
    a.addEventListener('click', function () { closeDlg(); });
  });

  // the chapter you are reading
  var items = $$('.contents__list a');
  var chapters = $$('[data-chapter]');
  function markReading() {
    var mid = innerHeight * 0.5, idx = 0;
    chapters.forEach(function (c, i) { if (c.getBoundingClientRect().top <= mid) idx = i; });
    items.forEach(function (a, i) {
      var st = a.querySelector('.contents__st');
      var on = i === idx;
      if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      st.textContent = on ? 'Reading' : '';
    });
  }
  var ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { ticking = false; if (dlg.open) markReading(); });
  }, { passive: true });
  ribbon.addEventListener('click', markReading);

  // ------------------------------------------------- reduced motion spans --
  if (reduce) {
    // no pinned travel that would only hold a still frame
    $('#top').setAttribute('data-sc-span', '1.15');
    writing.setAttribute('data-sc-span', '1.2');
    $('#reader').setAttribute('data-sc-span', '1.2');
  }

  ScrollCraft.mount(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(splitWords);
  // refit the page when the window changes shape
  var fitW = innerWidth, fitH = innerHeight, fitT = 0;
  addEventListener('resize', function () {
    if (innerWidth === fitW && innerHeight === fitH) return;
    fitW = innerWidth; fitH = innerHeight;
    clearTimeout(fitT);
    fitT = setTimeout(splitWords, 150);
  });
  requestAnimationFrame(loop);
})();
