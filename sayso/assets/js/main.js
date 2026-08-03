/* Sayso — hero channel loop + document scrollspy. No dependencies. */

(function () {
  "use strict";

  var calm = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------------------------------------------------------
     Hero: one conversation crossing the split, on a loop.
     THEM speaks on the left channel, the translation lands on
     the right — the same order the app produces it in.
     --------------------------------------------------------- */
  function heroLoop() {
    var stage = document.querySelector("[data-split]");
    if (!stage) return;

    var L = stage.querySelector(".chan--l");
    var R = stage.querySelector(".chan--r");

    var exchanges = [
      { from: "Japanese",  code: "ja",    said: "駅はどこですか？",        heard: "Where is the station?" },
      { from: "Spanish",   code: "es",    said: "¿Me cobras, por favor?",  heard: "Could I get the bill, please?" },
      { from: "Arabic",    code: "ar",    said: "كم سعر هذا؟",             heard: "How much does this cost?" },
      { from: "Korean",    code: "ko",    said: "여기 자리 있나요?",        heard: "Is this seat taken?" },
      { from: "French",    code: "fr",    said: "On se retrouve à huit heures ?", heard: "Shall we meet at eight?" }
    ];

    var i = 0;
    var timers = [];

    function clear() {
      timers.forEach(clearTimeout);
      timers = [];
    }

    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

    function paint(side, text, label) {
      side.querySelector(".line").textContent = text;
      side.querySelector(".chan__lang").textContent = label;
    }

    function play() {
      var x = exchanges[i];
      i = (i + 1) % exchanges.length;

      // reset
      L.classList.remove("is-live", "is-shown");
      R.classList.remove("is-live", "is-shown");

      // 1. they speak
      at(260, function () {
        paint(L, x.said, x.from + " · " + x.code);
        L.classList.add("is-live", "is-shown");
      });

      // 2. they stop; it is understood
      at(2100, function () { L.classList.remove("is-live"); });

      // 3. the translation reaches your ear
      at(2450, function () {
        paint(R, x.heard, "English · en");
        R.classList.add("is-live", "is-shown");
      });

      at(4400, function () { R.classList.remove("is-live"); });

      // 4. next exchange
      at(5900, function () {
        L.classList.remove("is-shown");
        R.classList.remove("is-shown");
        at(500, play);
      });
    }

    // Static, legible first frame for reduced motion — no loop at all.
    if (calm.matches) {
      var first = exchanges[0];
      paint(L, first.said, first.from + " · " + first.code);
      paint(R, first.heard, "English · en");
      L.classList.add("is-shown");
      R.classList.add("is-shown");
      return;
    }

    // Only run while the hero is actually on screen.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          clear();
          play();
        } else {
          clear();
        }
      });
    }, { threshold: 0.25 });

    io.observe(stage);
  }

  /* ---------------------------------------------------------
     Legal pages: highlight the section you are reading.
     --------------------------------------------------------- */
  function scrollspy() {
    var toc = document.querySelector("[data-toc]");
    if (!toc) return;

    var links = Array.prototype.slice.call(toc.querySelectorAll("a"));
    var map = {};
    var targets = [];

    links.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var el = document.getElementById(id);
      if (!el) return;
      map[id] = a;
      targets.push(el);
    });

    if (!targets.length) return;

    function mark(id) {
      links.forEach(function (a) { a.classList.remove("is-active"); });
      if (map[id]) map[id].classList.add("is-active");
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) mark(e.target.id);
      });
    }, { rootMargin: "-88px 0px -70% 0px", threshold: 0 });

    targets.forEach(function (t) { io.observe(t); });
  }

  /* ---------------------------------------------------------
     Year stamp in the footer.
     --------------------------------------------------------- */
  function year() {
    var slots = document.querySelectorAll("[data-year]");
    var y = String(new Date().getFullYear());
    Array.prototype.forEach.call(slots, function (s) { s.textContent = y; });
  }

  function init() {
    heroLoop();
    scrollspy();
    year();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
