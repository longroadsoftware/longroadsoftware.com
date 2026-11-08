/* The Proof Copy buy button: opens Paddle's overlay checkout for the one Proof Copy price.
 * Reads paddle-config.js. The price on the page is written in the HTML; Paddle's checkout shows
 * the buyer's own currency and any tax itself. Nothing is calculated here. */
(function () {
  var cfg = window.ProofCopyPaddle;
  var notice = document.getElementById("buy-notice");
  var buttons = document.querySelectorAll("[data-paddle-buy='proofcopy']");

  function say(text) {
    notice.textContent = text;
    notice.hidden = !text;
  }

  function refuse(reason) {
    say("Buying is not available right now (" + reason + "). Email support@mediaflowswift.com and we will sort it out.");
    buttons.forEach(function (b) { b.disabled = true; });
  }

  function theme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function open() {
    // No successUrl: Paddle does not add the transaction number to it, and the thank-you page needs it.
    // The checkout.completed event below carries the number, and we go to the thank-you page ourselves.
    Paddle.Checkout.open({
      items: [{ priceId: cfg.environment().price, quantity: 1 }],
      settings: { displayMode: "overlay", variant: "one-page", theme: theme(), showAddDiscounts: true }
    });
  }

  if (!cfg) return refuse("the checkout settings are missing");
  var missing = cfg.missing();
  if (missing) return refuse(missing);
  if (!window.Paddle) return refuse("the payment script did not load");

  if (cfg.isSandbox()) {
    Paddle.Environment.set("sandbox");
    say("Sandbox: test cards only. Nothing here is a real purchase.");
  }
  Paddle.Initialize({
    token: cfg.environment().token,
    eventCallback: function (event) {
      if (event.name === "checkout.completed") {
        var txn = event.data && (event.data.transaction_id || event.data.id);
        say("Payment complete. Fetching your licence key…");
        setTimeout(function () { window.location.href = cfg.thanksUrl(txn); }, 1500);
      }
      if (event.name === "checkout.error" || event.name === "checkout.payment-error") console.warn(event.name, event);
    }
  });
  buttons.forEach(function (b) {
    b.disabled = false;
    b.addEventListener("click", open);
  });
})();
