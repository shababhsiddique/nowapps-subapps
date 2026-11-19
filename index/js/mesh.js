/* mesh.js: the signature move. Page-local, not part of the engine.

   The twelve icon links in the top bar ARE the hero's mesh. Each one is
   transformed out of its bar slot to its node in the hero (three depths, joined
   by brand-blue lines like the Bitmesh logo). Scrolling through the hero's held
   span retracts the lines and brings every icon home, top nodes first, until the
   bar is the page's index. After that the bar marks the app on screen.

   Reads (node and slot rects) happen before writes (transforms) every frame.
   Reduced motion: no pin, no travel, no pointer. The icons cross-fade between
   the mesh and the bar instead. */
(function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hero = document.querySelector('.hero');
  var bar = document.getElementById('bar');
  var svg = document.querySelector('.mesh__lines');
  var after = document.querySelector('.mesh__after');
  var grid = document.querySelector('.hero__grid');
  if (!hero || !bar || !svg) return;

  var NS = 'http://www.w3.org/2000/svg';
  var nodes = {};
  Array.prototype.forEach.call(document.querySelectorAll('.mesh__node'), function (el) {
    var cs = el.style;
    nodes[el.getAttribute('data-node')] = {
      el: el,
      x: parseFloat(cs.getPropertyValue('--x')),
      y: parseFloat(cs.getPropertyValue('--y')),
      depth: parseFloat(el.getAttribute('data-depth')) || 1
    };
  });

  // Icons leave the mesh top-down, because the bar is at the top.
  var links = Array.prototype.map.call(document.querySelectorAll('.index__app'), function (a) {
    return { a: a, node: nodes[a.getAttribute('data-node')] };
  }).filter(function (l) { return l.node; });
  links.slice().sort(function (p, q) { return p.node.y - q.node.y; })
    .forEach(function (l, i) { l.rank = i; });

  /* ---- the lines: orthogonal runs between nodes, a dot at each elbow ---- */
  var EDGES = [
    ['productguard', 'streakd'], ['streakd', 'flexmeal'], ['productguard', 'driproom'],
    ['driproom', 'sayso'], ['sayso', 'waternow'], ['waternow', 'donttouch'],
    ['flexmeal', 'easycaption'], ['sayso', 'typenow'], ['driproom', 'novelai'],
    ['novelai', 'expensenow'], ['expensenow', 'typenow'], ['typenow', 'poem'],
    ['donttouch', 'poem']
  ];
  var DOTS = ['--mesh-green', '--mesh-sun', '--mesh-peach', '--mesh-mint', '--mesh-sky'];
  var paths = [], dots = [];
  var linesG = document.createElementNS(NS, 'g');
  var dotsG = document.createElementNS(NS, 'g');
  svg.appendChild(linesG); svg.appendChild(dotsG);
  EDGES.forEach(function (e, i) {
    var a = nodes[e[0]], b = nodes[e[1]];
    if (!a || !b) return;
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M' + a.x + ' ' + a.y + 'H' + b.x + 'V' + b.y);
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1 1';
    linesG.appendChild(p); paths.push(p);
    // An elbow dot only where the run actually turns, and not on every one.
    if (a.y !== b.y && a.x !== b.x && i % 3 !== 2) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', b.x); c.setAttribute('cy', a.y); c.setAttribute('r', '0.17');
      c.style.fill = 'var(' + DOTS[i % DOTS.length] + ')';
      dotsG.appendChild(c); dots.push(c);
    }
  });

  /* ---- helpers ---- */
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function band(a, b, t) { return clamp((t - a) / (b - a)); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* ---- state ---- */
  var slots = [];          // bar slot rects, measured with no transform
  var t0 = performance.now();
  var INTRO = reduce ? 0 : 1100;
  var mx = 0, my = 0, tx = 0, ty = 0;
  var raf = 0;
  var docked = null;       // reduced-motion state, for the cross-fade

  function measureSlots() {
    links.forEach(function (l) { l.a.style.transform = 'none'; });
    slots = links.map(function (l) { return l.a.getBoundingClientRect(); });
  }

  function heroProgress() {
    var r = hero.getBoundingClientRect();
    var travel = r.height - innerHeight;
    if (travel <= 1) return r.bottom < innerHeight * 0.4 ? 1 : 0;
    return clamp(-r.top / travel);
  }

  function frame(now) {
    raf = 0;
    var intro = INTRO ? smooth(band(0, INTRO, now - t0)) : 1;
    var p = heroProgress();

    // pointer lerp
    mx += (tx - mx) * 0.08; my += (ty - my) * 0.08;
    var moving = Math.abs(tx - mx) > 0.001 || Math.abs(ty - my) > 0.001;

    // READS
    var targets = links.map(function (l) { return l.node.el.getBoundingClientRect(); });

    // WRITES
    var lineK = reduce ? (p < 1 ? 1 : 0) : Math.min(intro, 1 - smooth(band(0.1, 0.4, p)));
    paths.forEach(function (path, i) {
      // each run draws in a little after the one before it
      var k = reduce ? lineK : Math.min(lineK, smooth(band(i * 0.04, 0.5 + i * 0.04, intro)));
      path.style.strokeDashoffset = (1 - k).toFixed(4);
    });
    dotsG.style.opacity = lineK.toFixed(3);

    var dock;
    if (reduce) {
      var want = p >= 1;
      if (want !== docked) {
        if (docked !== null) {
          bar.classList.add('is-swapping');
          setTimeout(function () { bar.classList.remove('is-swapping'); }, 200);
        }
        docked = want;
      }
      dock = docked ? 1 : 0;
    } else {
      dock = smooth(band(0.72, 0.96, p));
    }
    bar.style.setProperty('--dock', dock.toFixed(3));
    // On a phone the brand and contact link share the row the icons land in,
    // so they step aside before the first icon arrives.
    var arrive = reduce ? dock : smooth(band(0.12, 0.24, p));
    bar.style.setProperty('--arrive', arrive.toFixed(3));
    bar.classList.toggle('is-arriving', arrive > 0.98);
    bar.classList.toggle('is-docked', dock > 0.99);
    if (after) after.style.opacity = reduce ? 0 : smooth(band(0.8, 0.92, p)).toFixed(3);
    if (grid && !reduce) grid.style.transform = 'translate3d(' + (-mx * 4) + 'px,' + (-p * 50 - my * 4) + 'px,0)';
    svg.style.transform = reduce ? '' : 'translate3d(' + (mx * 6) + 'px,' + (my * 6 - p * 18) + 'px,0)';

    links.forEach(function (l, i) {
      var S = slots[i], T = targets[i];
      if (!S || !T || !S.width) return;
      var e;
      if (reduce) e = docked ? 1 : 0;
      else {
        var start = 0.2 + l.rank * 0.035;
        e = easeInOut(band(start, start + 0.32, p));
      }
      var stay = 1 - e;
      var d = l.node.depth;
      var k = T.width / S.width;
      var ox = reduce ? 0 : (mx * d * 7);
      var oy = reduce ? 0 : (my * d * 7 - p * d * 16);
      var x = (T.left - S.left + ox) * stay;
      var y = (T.top - S.top + oy) * stay;
      var sc = k + (1 - k) * e;
      l.a.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scale(' + sc.toFixed(4) + ')';
      l.a.style.setProperty('--lift', (d / 3 * stay).toFixed(3));
    });

    if (moving || (now - t0) < INTRO) request();
  }

  function request() { if (!raf) raf = requestAnimationFrame(frame); }

  // Measure and repaint in the same task, so the bar slots never show.
  function resize() {
    measureSlots();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    frame(performance.now());
  }

  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', resize);
  if (fine && !reduce) {
    addEventListener('pointermove', function (ev) {
      tx = (ev.clientX / innerWidth) * 2 - 1;
      ty = (ev.clientY / innerHeight) * 2 - 1;
      request();
    }, { passive: true });
  }

  /* ---- which app is on screen ---- */
  if ('IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (l) { byId[l.a.getAttribute('data-node')] = l.a; });
    // Every card crossing the middle band is current: a grid row holds up to
    // three, and picking one of them would be arbitrary.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var a = byId[en.target.id];
        if (!a) return;
        if (en.isIntersecting) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    Array.prototype.forEach.call(document.querySelectorAll('.app'), function (el) { io.observe(el); });
  }

  // Fonts change the bar's layout (brand width), so measure after them too.
  links.forEach(function (l) { l.a.style.setProperty('--i', l.rank); });
  resize();
  document.documentElement.classList.add('mesh-ready');
  // The staggered arrival is a one-time greeting; later fades are immediate.
  setTimeout(function () { document.documentElement.classList.add('mesh-settled'); }, 1400);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  addEventListener('load', resize);
})();
