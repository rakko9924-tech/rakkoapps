/* らっこアプリ — progressive enhancement only.
 * All app cards are static HTML (SEO-indexable). JS just filters visibility and reveals on scroll.
 */
(function () {
  "use strict";

  var grid = document.getElementById("app-grid");
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll(".app-card"));
  var chips = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  var search = document.getElementById("app-search");
  var empty = document.getElementById("empty");
  var countEl = document.getElementById("result-count-num");

  var activeCat = "all";
  var query = "";

  function normalize(s) {
    return (s || "").toLowerCase().replace(/\s+/g, "");
  }

  function apply() {
    var q = normalize(query);
    var shown = 0;
    cards.forEach(function (card) {
      var cat = card.getAttribute("data-cat") || "";
      var hay = normalize(card.getAttribute("data-search") || "");
      var catOk = activeCat === "all" || cat.split(" ").indexOf(activeCat) !== -1;
      var qOk = q === "" || hay.indexOf(q) !== -1;
      var visible = catOk && qOk;
      card.hidden = !visible;
      if (visible) shown++;
    });
    if (countEl) countEl.textContent = String(shown);
    if (empty) empty.classList.toggle("is-shown", shown === 0);
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      activeCat = chip.getAttribute("data-filter");
      chips.forEach(function (c) {
        c.setAttribute("aria-pressed", String(c === chip));
      });
      apply();
    });
  });

  if (search) {
    search.addEventListener("input", function () {
      query = search.value;
      apply();
    });
  }

  apply();

  /* Reveal on scroll */
  var reveal = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    reveal.forEach(function (el) { io.observe(el); });
  } else {
    reveal.forEach(function (el) { el.classList.add("is-in"); });
  }
})();
