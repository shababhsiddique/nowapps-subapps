/* ==========================================================================
   Habit Now — site behaviour

   Everything here is progressive. With JavaScript off you still get the page,
   the copy, the store links and a tree; what you lose is the growing.
   ========================================================================== */
(function () {
  "use strict";

  /* ----------------------------------------------------------------------
     Where the art comes from.

     "" serves the web-sized set committed under assets/ (~1.4 MB for the lot,
     built by tools/build_assets.py). To serve it from R2 instead, upload that
     same directory and point this at it, with a trailing slash:

         var ASSET_BASE = "https://habitsprites.nowapps.cc/sprites/web/v1/";

     Do NOT point this at sprites/v1/ — that is the app's full-resolution set,
     ~69 MB, where a single idle sheet outweighs this entire page.
     ---------------------------------------------------------------------- */
  var ASSET_BASE = "";

  var url = function (path) { return ASSET_BASE ? ASSET_BASE + path : "assets/" + path; };

  // The hero's two sprites are CSS backgrounds so they can paint before this
  // script runs. Repoint them only when the art is being served elsewhere.
  if (ASSET_BASE) {
    document.documentElement.style.setProperty(
      "--img-still", "url(" + url("tree/stage-2.webp") + ")");
    document.documentElement.style.setProperty(
      "--img-idle", "url(" + url("tree/idle-2.webp") + ")");
  }

  var calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };

  /* ========================================================== hero tree == */
  /* The still is already on screen from the markup. All this does is bring in
     the idle loop once its sheet has decoded, and cross-fade to it. If the
     sheet never arrives, the still stays — which is a perfectly good hero. */
  (function hero() {
    var tree = document.getElementById("heroTree");
    if (!tree || calm.matches) return;

    var sheet = new Image();
    var start = function () { tree.dataset.phase = "idle"; };

    if (sheet.decode) {
      sheet.src = url("tree/idle-2.webp");
      sheet.decode().then(start, start);
    } else {
      sheet.addEventListener("load", start);
      sheet.src = url("tree/idle-2.webp");
    }
  }());

  /* ============================================================== acts === */
  var stage = document.getElementById("actTree");
  var railFill = document.getElementById("railFill");
  var railLevel = document.getElementById("railLevel");
  var burst = document.getElementById("burst");
  var ornBox = document.getElementById("orns");
  var acts = [].slice.call(document.querySelectorAll(".act"));

  /* Lighting a sky means lighting every layer with that index — the page
     background and, on mobile, the matching copy inside the sticky panel. */
  function litLayers(i) {
    return [].slice.call(document.querySelectorAll('.sky__layer[data-sky="' + i + '"]'));
  }

  /* Which ornaments land, and where on the tree square. Mirrors ORNAMENT_SET
     in tools/build_assets.py — keep the two in step. */
  var ORNAMENTS = [
    { file: "clover",           x: .34, y: .84, size: "11%" },
    { file: "bird_yellow",      x: .30, y: .44, size: "13%" },
    { file: "butterfly_pink",   x: .74, y: .54, size: "12%" },
    { file: "snail_purple",     x: .23, y: .87, size: "10%" },
    { file: "bird_blue",        x: .64, y: .33, size: "13%" },
    { file: "cherry_blossom",   x: .69, y: .86, size: "11%" },
    { file: "squirrel_red",     x: .46, y: .52, size: "14%" },
    { file: "butterfly_purple", x: .18, y: .62, size: "12%" }
  ];

  if (stage && acts.length) {
    var treeA = document.getElementById("treeA");
    var treeB = document.getElementById("treeB");
    var front = treeA, back = treeB;
    var currentKey = "1";
    var currentLevel = 1;
    var currentSky = 0;
    var swapToken = 0;

    var frameSetOf = function (act) { return (act.dataset.frames || "1").split(","); };

    /* --- swap the tree still, cross-fading once the new one has decoded --- */
    function setFrame(key) {
      if (key === currentKey) return;
      currentKey = key;

      var level = parseInt(key, 10) || 1;
      var token = ++swapToken;
      back.src = url("tree/stage-" + key + ".webp");

      var show = function () {
        if (token !== swapToken) return;      // a faster scroll already won
        back.classList.add("is-on");
        front.classList.remove("is-on");
        var t = front; front = back; back = t;
      };

      if (back.complete && back.naturalWidth) show();
      else if (back.decode) back.decode().then(show, show);
      else back.onload = show;

      setLevel(level);
    }

    /* --- level drives the rail, the on-screen size, and the leaf burst ---- */
    function setLevel(level) {
      if (level === currentLevel) return;
      var climbed = level > currentLevel;
      currentLevel = level;

      railFill.style.width = (level * 10) + "%";
      railLevel.textContent = level;

      // Stage 1 sits at 82% of the box, stage 10 fills it.
      stage.style.setProperty("--grow", (0.82 + 0.18 * ((level - 1) / 9)).toFixed(3));

      if (climbed && !calm.matches) {
        stage.classList.remove("is-popping");
        void stage.offsetWidth;                // restart the animation
        stage.classList.add("is-popping");
        throwLeaves();
      }
    }

    var LEAF = ["#34C7A8", "#14B8A6", "#7BD389", "#A7E08C", "#2DD4BF"];
    var burstBusy = false;
    function throwLeaves() {
      if (!burst || burstBusy) return;
      burstBusy = true;
      burst.innerHTML = "";
      for (var i = 0; i < 14; i++) {
        var a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
        var d = 90 + Math.random() * 90;
        var leaf = document.createElement("i");
        leaf.style.setProperty("--dx", Math.cos(a) * d + "px");
        leaf.style.setProperty("--dy", (Math.sin(a) * d - 40) + "px");
        leaf.style.setProperty("--rot", Math.round(Math.random() * 720 - 360) + "deg");
        leaf.style.setProperty("--dl", (Math.random() * 0.14).toFixed(2) + "s");
        leaf.style.setProperty("--lc", LEAF[i % LEAF.length]);
        burst.appendChild(leaf);
      }
      burst.classList.add("is-on");
      setTimeout(function () {
        burst.classList.remove("is-on");
        burst.innerHTML = "";
        burstBusy = false;
      }, 1300);
    }

    /* --- ornaments arrive one at a time through act 3 --------------------- */
    var ornNodes = [];
    function setOrnamentCount(n) {
      for (var i = 0; i < ORNAMENTS.length; i++) {
        var want = i < n;
        var node = ornNodes[i];

        if (want && !node) {
          var o = ORNAMENTS[i];
          node = document.createElement("i");
          node.style.setProperty("--x", o.x);
          node.style.setProperty("--y", o.y);
          node.style.setProperty("--ow", o.size);
          node.style.backgroundImage = "url(" + url("orn/" + o.file + ".webp") + ")";
          ornBox.appendChild(node);
          ornNodes[i] = node;
          // let the browser register the start state before transitioning in
          raf(function (el) { return function () { el.classList.add("is-in"); }; }(node));
        } else if (node) {
          node.classList.toggle("is-in", want);
        }
      }
    }

    /* --- sky ------------------------------------------------------------- */
    function setSky(i) {
      var next = litLayers(i);
      if (i === currentSky || !next.length) return;
      litLayers(currentSky).forEach(function (el) { el.classList.remove("is-lit"); });
      next.forEach(function (el) { el.classList.add("is-lit"); });
      currentSky = i;
    }

    /* --- preloading ------------------------------------------------------ */
    var warmed = {};
    function warm(act) {
      if (!act) return;
      frameSetOf(act).forEach(function (key) {
        if (warmed[key]) return;
        warmed[key] = true;
        var img = new Image();
        img.src = url("tree/stage-" + key + ".webp");
      });
    }
    // Held back so the first act's stages (~150KB) don't queue in front of the
    // hero's idle sheet, which is the one thing that has to arrive quickly.
    setTimeout(function () { warm(acts[0]); }, 2000);

    /* --- the scroll loop ------------------------------------------------- */
    var ticking = false;
    function measure() {
      ticking = false;
      var mid = window.innerHeight * 0.5;
      var active = -1, progress = 0;

      // Below the acts the day is finished. Settle the sky so the rest of the
      // page isn't read against a full sunset.
      var section = document.getElementById("acts");
      if (section && section.getBoundingClientRect().bottom < mid) {
        setSky(5);
        return;
      }

      for (var i = 0; i < acts.length; i++) {
        var r = acts[i].getBoundingClientRect();
        if (r.height === 0) continue;
        var p = (mid - r.top) / r.height;
        if (p >= 0 && p < 1) { active = i; progress = p; break; }
        if (p >= 1) { active = i; progress = 0.999; }   // past it; keep the last
      }

      if (active < 0) {                                  // still up in the hero
        setSky(0);
        setFrame("1");
        setOrnamentCount(0);
        return;
      }

      var act = acts[active];
      var frames = frameSetOf(act);
      var idx = Math.min(frames.length - 1, Math.floor(progress * frames.length));

      setSky(parseInt(act.dataset.sky, 10) || 0);
      setFrame(frames[idx]);

      if (act.dataset.orn) {
        setOrnamentCount(Math.min(ORNAMENTS.length,
          Math.round(progress * (ORNAMENTS.length + 1))));
      } else if (active < 2) {
        setOrnamentCount(0);
      }

      warm(acts[active + 1]);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      raf(measure);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    measure();
  }

  /* ====================================================== the Today list == */
  /* The habit cards fill and tick themselves once, when you first reach them. */
  (function todayDemo() {
    var phone = document.getElementById("phone");
    if (!phone || !("IntersectionObserver" in window)) return;

    var cards = [].slice.call(phone.querySelectorAll(".hcard"));
    cards.forEach(function (c) {
      if (c.dataset.fill) c.style.setProperty("--to", c.dataset.fill);
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.disconnect();

        if (calm.matches) {
          cards.forEach(function (c) { c.classList.add("is-filled", "is-done"); });
          cards.forEach(function (c) {
            var n = c.querySelector(".hcard__n");
            if (n) n.textContent = "3";
          });
          return;
        }

        cards.forEach(function (card, i) {
          setTimeout(function () {
            card.style.setProperty("--to", "100");
            card.classList.add("is-filled", "is-done");
            var n = card.querySelector(".hcard__n");
            if (n) countTo(n, 3);
            var pill = card.querySelector(".pill--flame");
            if (pill) {
              var m = /(\d+)/.exec(pill.textContent);
              if (m) countTo(pill, parseInt(m[1], 10) + 1, "🔥 ");
            }
          }, 380 + i * 420);
        });
      });
    }, { threshold: 0.4 });

    io.observe(phone);

    function countTo(el, target, prefix) {
      var from = parseInt(/(\d+)/.exec(el.textContent)[1], 10);
      var steps = Math.max(1, target - from);
      var i = 0;
      var tick = setInterval(function () {
        i++;
        el.textContent = (prefix || "") + (from + i);
        if (i >= steps) clearInterval(tick);
      }, 260);
    }
  }());

  /* ============================================================ reveals == */
  /* Added by script so that with JS off nothing is left invisible. */
  (function reveals() {
    if (!("IntersectionObserver" in window)) return;

    // Deliberately not .prose: a wall of legal text has no business sliding
    // around, and it is taller than the viewport anyway.
    var targets = [].slice.call(document.querySelectorAll(
      ".slab__head, .facts li, .letter__intro, .note, .tier, .get__inner > *, .mailcard, .faq details"
    ));
    if (!targets.length) return;

    targets.forEach(function (el, i) {
      el.classList.add("reveal");
      el.style.transitionDelay = (Math.min(i % 6, 5) * 55) + "ms";
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
      // threshold 0, not a fraction: a fraction of an element taller than the
      // viewport can never be met, and the element stays invisible forever.
    }, { threshold: 0, rootMargin: "0px 0px -10% 0px" });

    targets.forEach(function (el) { io.observe(el); });
  }());

  /* ======================================================= sub-page pet == */
  /* Each sub-page carries one ornament so it belongs to the same world. */
  (function pagepet() {
    var pet = document.querySelector(".pagepet");
    if (!pet || !pet.dataset.pet) return;
    pet.style.backgroundImage = "url(" + url("orn/" + pet.dataset.pet + ".webp") + ")";
  }());

  /* ================================================ deletion request ===== */
  /* delete-account.php. Catches the two mistakes worth catching before a
     round trip — purely a courtesy. The PHP re-checks everything, because
     this can be switched off, and the errors it renders use these same
     hooks, so with JavaScript off the form still works and still explains
     itself. */
  (function deleteForm() {
    var form = document.querySelector(".reqform");
    if (!form) return;

    var email = form.querySelector("#email");
    var confirm = form.querySelector('input[name="confirm"]');
    if (!email || !confirm) return;

    var setError = function (field, message) {
      var box = document.getElementById(field.getAttribute("aria-describedby"));
      if (box) box.textContent = message || "";
      if (message) field.setAttribute("aria-invalid", "true");
      else field.removeAttribute("aria-invalid");
    };

    // Deliberately lax. The server does the real check; this only exists to
    // catch a typo, not to argue with anyone's address.
    var looksLikeEmail = function (value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    };

    form.addEventListener("submit", function (ev) {
      var bad = null;

      if (!looksLikeEmail(email.value.trim())) {
        setError(email, email.value.trim()
          ? "That doesn’t look like an email address."
          : "Enter the email address on the account.");
        bad = email;
      } else {
        setError(email, "");
      }

      if (!confirm.checked) {
        setError(confirm, "Please confirm you understand this is permanent.");
        bad = bad || confirm;
      } else {
        setError(confirm, "");
      }

      if (bad) {
        ev.preventDefault();
        bad.focus();
      }
    });

    // Clear a complaint as soon as the reader starts fixing it.
    email.addEventListener("input", function () { setError(email, ""); });
    confirm.addEventListener("change", function () { setError(confirm, ""); });
  }());

}());
