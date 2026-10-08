// Public identity. Change these here; the nav, footer and CA section read them.
export const SITE = "https://tappay.si";
/** X handle without the @. Empty until the account is live: the button then searches X for the site. */
export const X_HANDLE = "";
/** Token contract (mint) address on Solana. Empty until launch: the CA section then says so. */
export const CA = "";

export const X_URL = X_HANDLE ? `https://x.com/${X_HANDLE}` : `https://x.com/search?q=${encodeURIComponent("tappay.si")}`;
