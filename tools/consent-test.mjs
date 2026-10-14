/* Behaviour checks for analytics.js, with a small fake browser. No install:
     node tools/consent-test.mjs            (from the repo root)
     node tools/consent-test.mjs ../mediaflowswift.com/analytics.js
   A copy of mwmike/mediaflowswift.com tools/consent-test.mjs. The same
   analytics.js is served by both sites; each repo checks the copy it ships. */
import fs from "node:fs";
const src = fs.readFileSync(process.argv[2] || "analytics.js", "utf8");

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL:", name); } }

function makeEl(tag) {
  const el = {
    tagName: tag, children: [], parentNode: null, attrs: {}, style: {},
    className: "", type: "", textContent: "", innerHTML: "", async: false, src: "",
    offsetHeight: 180, listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
    click(target) { (this.listeners.click || []).forEach(f => f({ target: target || this })); },
  };
  return el;
}

function run({ stored = null, blocked = false, privacyPage = false } = {}) {
  const head = makeEl("head"), body = makeEl("body");
  const tag = makeEl("script");
  tag.setAttribute("data-ga", "G-TEST123");
  const choice = privacyPage ? makeEl("p") : null;
  const store = { v: stored };
  const win = {
    localStorage: {
      getItem() { if (blocked) throw new Error("blocked"); return store.v; },
      setItem(k, v) { if (blocked) throw new Error("blocked"); store.v = v; },
    },
    addEventListener(t, f) { (this._l ||= {}); (this._l[t] ||= []).push(f); },
    removeEventListener(t, f) { if (this._l && this._l[t]) this._l[t] = this._l[t].filter(x => x !== f); },
  };
  const doc = {
    currentScript: tag, head, body,
    createElement: makeEl,
    querySelector: () => tag,
    getElementById: (id) => (id === "analytics-choice" ? choice : null),
    createTextNode: (t) => ({ textContent: t }),
    addEventListener() {},
    set cookie(v) { (this._cookies ||= []).push(v); },
    get cookie() { return ""; },
  };
  new Function("window", "document", "localStorage", "location", src)(win, doc, win.localStorage, { hostname: "longroadsoftware.com" });
  const notice = body.children.find(c => c.className === "consent") || null;
  return {
    body, head, win, doc, notice, choice, store,
    ga: () => head.children.filter(c => String(c.src).includes("googletagmanager")).length,
    press: (said) => {
      const btn = makeEl("button"); btn.setAttribute("data-said", said);
      notice.click(btn);
    },
  };
}

// 1 first visit
let t = run();
ok("first visit: no GA", t.ga() === 0);
ok("first visit: notice shown", !!t.notice);
ok("first visit: footer held clear", t.body.style.paddingBottom === "180px");
ok("first visit: nothing stored", t.store.v === null);
ok("first visit: resize watched", !!t.win._l && t.win._l.resize.length === 1);

// 2 press yes
t = run(); t.press("yes");
ok("yes: GA loaded once", t.ga() === 1);
ok("yes: notice gone", t.notice.parentNode === null);
ok("yes: padding released", t.body.style.paddingBottom === "");
ok("yes: remembered", t.store.v === "yes");
ok("yes: resize listener dropped", t.win._l.resize.length === 0);

// 3 press no
t = run(); t.press("no");
ok("no: no GA", t.ga() === 0);
ok("no: padding released", t.body.style.paddingBottom === "");
ok("no: remembered", t.store.v === "no");

// 4/5 return visits
t = run({ stored: "yes" });
ok("return yes: GA loaded", t.ga() === 1);
ok("return yes: no notice", !t.notice);
ok("return yes: no padding", !t.body.style.paddingBottom);
t = run({ stored: "no" });
ok("return no: no GA", t.ga() === 0);
ok("return no: no notice", !t.notice);

// 6 storage blocked
t = run({ blocked: true });
ok("blocked: notice shown", !!t.notice);
ok("blocked: no GA before an answer", t.ga() === 0);
t.press("no");
ok("blocked + no: still no GA", t.ga() === 0);
t = run({ blocked: true }); t.press("yes");
ok("blocked + yes: GA on this page", t.ga() === 1);
ok("blocked + yes: padding released", t.body.style.paddingBottom === "");

// 7 privacy page, first visit, notice on screen
t = run({ privacyPage: true });
ok("privacy first visit: line says not answered yet",
  /You have not answered yet/.test(t.choice.textContent) && /notice at the bottom/.test(t.choice.textContent));
ok("privacy first visit: no Change button yet", t.choice.children.length === 0);

// 8 privacy page with an answer, and changing it
t = run({ stored: "no", privacyPage: true });
ok("privacy no: line says no", /You said no/.test(t.choice.textContent));
const change = t.choice.children.find(c => c.className === "consent-change");
ok("privacy no: Change that button", !!change);
change.click();
ok("privacy: change to yes loads GA", t.ga() === 1);
ok("privacy: change to yes is remembered", t.store.v === "yes");
ok("privacy: line now says yes", /You said yes/.test(t.choice.textContent));

t = run({ stored: "yes", privacyPage: true });
ok("privacy yes: GA loaded", t.ga() === 1);
t.choice.children.find(c => c.className === "consent-change").click();
ok("privacy: change to no sets Google's off switch", t.win["ga-disable-G-TEST123"] === true);
ok("privacy: change to no clears cookies", (t.doc._cookies || []).length > 0);
ok("privacy: change to no clears the cookie on the registrable domain, not just the host",
  (t.doc._cookies || []).some(c => /^_ga=;.*domain=\./.test(c)));
ok("privacy: change to no is remembered", t.store.v === "no");

// 9 privacy page: yes, then no, then yes again, with no reload between
t = run({ stored: "yes", privacyPage: true });
const buttons = () => t.choice.children.filter(c => c.className === "consent-change");
const toggle = () => buttons()[buttons().length - 1].click();
const configs = () => (t.win.dataLayer || []).filter(a => a[0] === "config").length;
ok("re-enable: counted once to start", configs() === 1);
toggle();
ok("re-enable: off switch set by the no", t.win["ga-disable-G-TEST123"] === true);
ok("re-enable: nothing sent while off", configs() === 1);
toggle();
ok("re-enable: off switch cleared by the yes", t.win["ga-disable-G-TEST123"] === false);
ok("re-enable: Google's script not loaded a second time", t.ga() === 1);
ok("re-enable: this visit is counted again, no reload", configs() === 2);
ok("re-enable: remembered as yes", t.store.v === "yes");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
