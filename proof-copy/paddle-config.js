/* Paddle checkout and the licence service for Proof Copy, on longroadsoftware.com.
 *
 * THE SWITCH: LIVE below. false = Paddle sandbox (test cards only, nothing is a real purchase).
 * true = real purchases at the live price. Nothing else on the site needs to change.
 * With LIVE = true, a page opened with ?sandbox=1 still uses the sandbox, for testing.
 *
 * Client-side tokens are public by design (they can only open checkouts and preview prices).
 * They are the same tokens mediaflowswift.com uses: one Paddle account sells both apps.
 * The API key stays in the licence service and is never on this site.
 * Sandbox and live are separate accounts, so ids from one never work in the other.
 */
window.ProofCopyPaddle = (function () {
  var LIVE = false;

  var environments = {
    sandbox: {
      token: "test_d722e70ada0734b95ca60bcd10d",
      licenceService: "https://mediaflow-licence.mediaflow-licence.workers.dev",
      price: "pri_01m6m4gaczsgehjd7ja2pgp6ht"   // product pro_01m6m4ga3n351t4x1jy9f7768g
    },
    production: {
      token: "live_f5b3acbcf166c01adb719e99b9a",
      licenceService: "https://mediaflow-licence-production.mediaflow-licence.workers.dev",
      price: "pri_01m6m4gb5et9a06fzgw8kmp6jf"   // product pro_01m6m4gavcwxncq40nc541hhzw
    }
  };

  function isSandbox() {
    return !LIVE || new URLSearchParams(window.location.search).get("sandbox") === "1";
  }

  function environmentName() {
    return isSandbox() ? "sandbox" : "production";
  }

  function environment() {
    return environments[environmentName()];
  }

  /** Why this environment cannot sell, or null when it is complete. */
  function missing() {
    var env = environment();
    if (!env.token) return "no client token for " + environmentName();
    if (!env.price) return "no " + environmentName() + " price id";
    return null;
  }

  /** The page Paddle's buyer lands on, carrying the transaction number (and ?sandbox=1 when the switch was overridden). */
  function thanksUrl(transactionId) {
    var url = new URL("/proof-copy/thanks.html", window.location.origin);
    if (LIVE && isSandbox()) url.searchParams.set("sandbox", "1");
    if (transactionId) url.searchParams.set("_ptxn", transactionId);
    return url.toString();
  }

  return { live: LIVE, isSandbox: isSandbox, environmentName: environmentName, environment: environment, missing: missing, thanksUrl: thanksUrl };
})();
