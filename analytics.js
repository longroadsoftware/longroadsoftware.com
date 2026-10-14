/* Analytics, off until the visitor says yes.

   No Google code is in any page of this site. This file loads Google
   Analytics only after a visitor presses Yes on the notice, and remembers
   the answer in localStorage, which sets no cookie of its own. No answer
   counts as no: closing the page, ignoring the notice, or a browser that
   blocks storage all leave analytics off.

   Pages load it with the measurement id on the tag:
     <script src="/analytics.js" data-ga="G-XXXXXXX" defer></script>
   An optional data-privacy="..." sets where the notice's link points,
   for the site whose privacy page lives on another domain.
*/
(function () {
  var tag = document.currentScript || document.querySelector("script[data-ga]");
  var id = tag && tag.getAttribute("data-ga");
  if (!id) return;
  var privacyUrl = (tag && tag.getAttribute("data-privacy")) || "/privacy.html";
  var store = "analytics-consent";
  var loaded = false;

  function answer() {
    try { return window.localStorage.getItem(store); } catch (e) { return null; }
  }

  function remember(said) {
    try { window.localStorage.setItem(store, said); } catch (e) { /* this page only */ }
  }

  function load() {
    window["ga-disable-" + id] = false;
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
    window.gtag("js", new Date());
    window.gtag("config", id);
  }

  /* Someone who says no after having said yes: stop sending, and clear
     what was set. Google reads this flag, so nothing more is sent without
     a reload. */
  function stop() {
    window["ga-disable-" + id] = true;
    var names = ["_ga", "_ga_" + id.replace(/^G-/, ""), "_gid"];
    for (var i = 0; i < names.length; i++) {
      document.cookie = names[i] + "=; Max-Age=0; path=/";
      document.cookie = names[i] + "=; Max-Age=0; path=/; domain=" + location.hostname;
    }
  }

  function ask() {
    var box = document.createElement("div");
    box.className = "consent";
    box.setAttribute("role", "region");
    box.setAttribute("aria-label", "Before we count this visit");
    box.innerHTML =
      '<div class="consent-inner">' +
      "<h2>Before we count this visit</h2>" +
      "<p>We use Google Analytics to see which pages people read. It sets cookies in your " +
      "browser and tells Google the page address, where you came from, your browser and " +
      "device type, and roughly where you are. It is off until you say yes.</p>" +
      "<p>Saying no does not change the site. Nothing we sell needs this.</p>" +
      '<p class="consent-buttons">' +
      '<button type="button" data-said="yes">Yes, count my visit</button>' +
      '<button type="button" data-said="no">No</button>' +
      "</p>" +
      '<p class="consent-more">What we collect and why &mdash; our <a href="' +
      privacyUrl + '">privacy page</a>.</p>' +
      "</div>";
    box.addEventListener("click", function (event) {
      var said = event.target.getAttribute && event.target.getAttribute("data-said");
      if (!said) return;
      remember(said);
      if (said === "yes") load();
      if (box.parentNode) box.parentNode.removeChild(box);
      showChoice();
    });
    document.body.appendChild(box);
  }

  /* The privacy page carries <p id="analytics-choice">, so a visitor can
     see what they chose and change it. Other pages have no such element
     and this does nothing. */
  function showChoice() {
    var slot = document.getElementById("analytics-choice");
    if (!slot) return;
    var said = answer();
    if (said !== "yes" && said !== "no") {
      slot.textContent = "We have not asked you yet.";
      return;
    }
    slot.textContent = said === "yes"
      ? "You said yes to analytics on this site. "
      : "You said no to analytics on this site. Nothing is sent. ";
    var change = document.createElement("button");
    change.type = "button";
    change.className = "consent-change";
    change.textContent = "Change that";
    change.addEventListener("click", function () {
      var now = answer() === "yes" ? "no" : "yes";
      remember(now);
      if (now === "yes") load(); else stop();
      showChoice();
    });
    slot.appendChild(change);
    slot.appendChild(document.createTextNode(" — no reload needed."));
  }

  function start() {
    var said = answer();
    if (said === "yes") load();
    else if (said !== "no") ask();
    showChoice();
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
