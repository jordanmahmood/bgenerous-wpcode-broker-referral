(() => {
  const sourceUrl =
    "https://raw.githubusercontent.com/jordanmahmood/bgenerous-wpcode-broker-referral/main/bgenerous-referral-runtime.js";

  fetch(`${sourceUrl}?v=${Date.now()}`, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`BGenerous referral runtime fetch failed: ${response.status}`);
      }

      return response.text();
    })
    .then((source) => {
      (0, eval)(source);
    })
    .catch((error) => {
      console.error("BGenerous referral bootstrap failed", error);
    });
})();
