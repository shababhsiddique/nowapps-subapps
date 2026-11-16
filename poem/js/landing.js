/* Poem Writer landing: the feeling dial, the reading room, the running head.
   The scroll engine (scrollcraft.js) drives the pinned acts; this file is the
   page's own behaviour and never edits the engine. */
(function () {
  'use strict';

  // Sample poems written for this page, one per tone, all on the same topic.
  var POEMS = {
    hopeful: {
      tone: 'Hopeful', form: 'Free verse', title: 'The Streets Rinse Clean',
      lines: [
        'The rain has gone on ahead of us,',
        'leaving the pavement bright as a page.',
        'A bus sighs at the corner.',
        'Someone opens a window,',
        'and the whole street',
        'decides to start again.'
      ]
    },
    wistful: {
      tone: 'Wistful', form: 'Tanka', title: 'Wet Lamps',
      lines: [
        'Wet lamps on the street',
        'hold what is left of the light.',
        'The gutters run soft.',
        'I still listen for your step',
        'on stairs that no longer creak.'
      ]
    },
    romantic: {
      tone: 'Romantic', form: 'Rhymed quatrains', title: 'Under One Umbrella',
      lines: [
        'We ran the last two blocks in rain,',
        'your laughter louder than the street;',
        'now every puddle, every lane',
        'remembers where our shoulders meet.',
        '',
        'The city hushes, wrung and bright,',
        'the awnings drip a slower time,',
        'and all the windows hold the light',
        'as if they waited for the rhyme.'
      ]
    },
    reflective: {
      tone: 'Reflective', form: 'Haiku', title: 'Upturned',
      lines: [
        'The whole town, upturned',
        'in one puddle by the curb.',
        'A bird drinks the sky.'
      ]
    },
    playful: {
      tone: 'Playful', form: 'Limerick', title: 'The Drainpipe Choir',
      lines: [
        'The drainpipes all sang in a row',
        'with a gurgle and glug from below,',
        'till the sun cleared its throat,',
        'hit a bright yellow note,',
        'and the puddles applauded the show.'
      ]
    }
  };

  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  var lamp = document.querySelector('[data-lamp]');
  var roomLines = document.querySelector('[data-room]');
  var current = 'hopeful';

  function renderLines(el, poem) {
    var max = parseInt(el.getAttribute('data-max'), 10) || 0;
    var keepLamp = el.contains(lamp) ? lamp : null;
    el.textContent = '';
    if (keepLamp) el.appendChild(keepLamp);
    var count = 0;
    for (var i = 0; i < poem.lines.length; i++) {
      var t = poem.lines[i];
      if (max && count >= max) break;
      var s = document.createElement('span');
      if (t === '') { s.className = 'gap'; s.setAttribute('aria-hidden', 'true'); }
      else { s.className = 'ln'; s.textContent = t; count++; }
      el.appendChild(s);
    }
  }

  function paint(tone, animate) {
    var poem = POEMS[tone];
    if (!poem) return;
    current = tone;
    root.setAttribute('data-tone', tone);
    var nodes = document.querySelectorAll('[data-poem-lines], [data-poem-title]');
    function swap() {
      document.querySelectorAll('[data-poem-title]').forEach(function (el) { el.textContent = poem.title; });
      document.querySelectorAll('[data-poem-tone]').forEach(function (el) { el.textContent = poem.tone; });
      document.querySelectorAll('[data-poem-form]').forEach(function (el) { el.textContent = poem.form; });
      document.querySelectorAll('[data-poem-lines]').forEach(function (el) { renderLines(el, poem); });
      nodes.forEach(function (el) { el.classList.remove('is-swapping'); });
      stopReading();
      lastLine = -2;
      measureRoom();
      tickRoom();
    }
    if (animate && !reduce) {
      nodes.forEach(function (el) { el.classList.add('is-swapping'); });
      setTimeout(swap, 240);
    } else swap();
  }

  // ---------------------------------------------------------------- dial --
  var saved = store.get('poemwriter-tone');
  var radios = document.querySelectorAll('input[name="tone"]');
  radios.forEach(function (r) {
    if (saved && r.value === saved) r.checked = true;
    r.addEventListener('change', function () {
      if (r.checked) { paint(r.value, true); store.set('poemwriter-tone', r.value); }
    });
  });

  // ------------------------------------------------------- reading room --
  var room = document.querySelector('.room');
  var track = document.querySelector('[data-track]');
  var counter = document.querySelector('[data-count]');
  var playBtn = document.querySelector('[data-play]');
  var player = document.querySelector('[data-player]');
  var lineEls = [];
  var lastLine = -2;
  var speaking = false;
  var rate = 1;

  function measureRoom() {
    lineEls = roomLines ? Array.prototype.slice.call(roomLines.querySelectorAll('.ln')) : [];
  }

  function light(i) {
    if (i === lastLine) return;
    lastLine = i;
    for (var k = 0; k < lineEls.length; k++) lineEls[k].classList.toggle('is-on', k === i);
    if (i < 0 || !lineEls[i]) {
      lamp.classList.remove('is-on');
      track.style.transform = 'scaleX(0)';
      counter.textContent = '';
      return;
    }
    var el = lineEls[i];
    lamp.style.height = el.offsetHeight + 'px';
    lamp.style.transform = 'translateY(' + el.offsetTop + 'px)';
    lamp.classList.add('is-on');
    track.style.transform = 'scaleX(' + ((i + 1) / lineEls.length).toFixed(3) + ')';
    counter.textContent = 'Line ' + (i + 1) + ' of ' + lineEls.length;
  }

  // Scroll is the narrator: the first 14% of the act is silence, the last
  // 12% holds on the final line.
  function tickRoom() {
    if (!room || speaking || !lineEls.length) return;
    var r = room.getBoundingClientRect();
    var travel = r.height - innerHeight;
    var p = travel > 0 ? Math.min(Math.max(-r.top / travel, 0), 1) : 0;
    var start = 0.14, end = 0.88;
    var i = p < start ? -1 : Math.min(lineEls.length - 1, Math.floor(((p - start) / (end - start)) * lineEls.length));
    light(i);
  }

  var ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; tickRoom(); runHead(); });
  }, { passive: true });
  addEventListener('resize', function () { lastLine = -2; tickRoom(); });

  // speech: one utterance per line, so the highlight is exact on every voice
  var synth = window.speechSynthesis;
  var voice = null;
  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices().filter(function (v) { return /^en(-|_|$)/i.test(v.lang); });
    voice = vs.find(function (v) { return v.localService && /samantha|daniel|karen|moira|serena|google uk english female|aria|jenny/i.test(v.name); })
         || vs.find(function (v) { return v.localService; }) || vs[0] || null;
    if (voice) document.querySelector('[data-voice]').textContent = voice.name.replace(/\s*\(.*\)$/, '');
  }
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    player.setAttribute('data-unsupported', '');
    document.querySelector('[data-fine]').textContent = 'This browser cannot read aloud. In the app, the voices already on your iPhone or iPad read every poem.';
  } else {
    pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
  }

  var session = 0;
  function readFrom(i, id) {
    if (id !== session || i >= lineEls.length) { if (id === session) stopReading(); return; }
    light(i);
    var u = new SpeechSynthesisUtterance(lineEls[i].textContent);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : 'en-US';
    u.rate = rate * 0.92;
    u.onend = function () { setTimeout(function () { readFrom(i + 1, id); }, 260); };
    u.onerror = function () { if (id === session) stopReading(); };
    synth.speak(u);
  }
  function stopReading() {
    session++;
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
    speaking = false;
    if (playBtn) { playBtn.setAttribute('aria-pressed', 'false'); playBtn.setAttribute('aria-label', 'Read this poem aloud'); }
  }
  if (playBtn) {
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.addEventListener('click', function () {
      if (speaking) { stopReading(); lastLine = -2; tickRoom(); return; }
      measureRoom();
      speaking = true;
      playBtn.setAttribute('aria-pressed', 'true');
      playBtn.setAttribute('aria-label', 'Stop reading');
      synth.cancel();
      readFrom(0, ++session);
    });
  }
  document.querySelectorAll('.pace [data-rate]').forEach(function (b) {
    b.addEventListener('click', function () {
      rate = parseFloat(b.getAttribute('data-rate')) || 1;
      document.querySelectorAll('.pace [data-rate]').forEach(function (o) { o.setAttribute('aria-checked', String(o === b)); });
    });
  });
  // leaving the room stops the voice
  if ('IntersectionObserver' in window && room) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!e.isIntersecting && speaking) stopReading(); });
    }).observe(room);
  }

  // --------------------------------------------------------- running head --
  var head = document.querySelector('[data-head]');
  var run = document.querySelector('[data-run]');
  var chapters = Array.prototype.slice.call(document.querySelectorAll('[data-chapter]'));
  function runHead() {
    var probe = 56;
    var here = null;
    for (var c = 0; c < chapters.length; c++) {
      var r = chapters[c].getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) { here = chapters[c]; break; }
    }
    var title = here ? here.getAttribute('data-chapter') : '';
    if (run.textContent !== title) run.textContent = title;
    var state = !here || here.classList.contains('cover') ? 'clear' : (here === room ? 'night' : 'paper');
    if (!here && scrollY > 200) state = 'paper';
    if (head.getAttribute('data-state') !== state) head.setAttribute('data-state', state);
  }

  // ------------------------------------------------------------------ go --
  paint(saved && POEMS[saved] ? saved : 'hopeful', false);
  if (window.ScrollCraft) ScrollCraft.mount(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { lastLine = -2; measureRoom(); tickRoom(); });
  runHead();
})();
