/* Light or dark. The site follows the computer's setting until the visitor
   presses the switch in the menu; that choice is kept in localStorage on
   this browser only. Nothing is sent anywhere.

   Pages load it in <head>, without defer, so the saved choice is applied
   before the page is drawn:
     <script src="/theme.js"></script>
*/
(function () {
  var store = "theme";
  var root = document.documentElement;
  var dark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function saved() {
    try { return window.localStorage.getItem(store); } catch (e) { return null; }
  }

  function current() {
    var t = root.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return dark && dark.matches ? "dark" : "light";
  }

  var first = saved();
  if (first === "light" || first === "dark") root.setAttribute("data-theme", first);

  function label(button) {
    var next = current() === "dark" ? "light" : "dark";
    button.setAttribute("aria-label", "Use " + next + " mode");
  }

  function add() {
    var nav = document.querySelector(".top nav");
    if (!nav || nav.querySelector(".theme-switch")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "theme-switch";
    button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
      '<path class="moon" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>' +
      '<g class="sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g>' +
      "</svg>";
    label(button);
    button.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { window.localStorage.setItem(store, next); } catch (e) { /* this page only */ }
      label(button);
    });
    if (dark && dark.addEventListener) dark.addEventListener("change", function () { label(button); });
    nav.appendChild(button);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
  else add();
})();
