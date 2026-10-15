export const ERROR_STATUS = {
  TAB_NOT_FOUND: 404,
  TAB_EXPIRED: 403,
  TAB_REVOKED: 403,
  TAB_CLOSED: 403,
  INSUFFICIENT_TAB_BALANCE: 402,
  PAYMENT_EXCEEDS_TAB_LIMIT: 403,
  RECIPIENT_NOT_ALLOWED: 403,
  UNSUPPORTED_MINT: 400,
  UNSUPPORTED_PAYMENT_REQUIREMENT: 400,
  DUPLICATE_REQUEST: 409,
  INVALID_CREDENTIAL: 401,
  // Non-payment errors used by the dashboard API.
  UNAUTHORIZED: 401,
  BAD_REQUEST: 400,
  NOT_ACTIVATED: 409,
  CHAIN_STATE_MISMATCH: 409,
  CHAIN_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/**
 * A unique, stable number per error code (the HTTP status is shared, e.g. several 403s). Never reuse or
 * renumber: agents and integrations may switch on it. Groups: 1xxx key/session, 2xxx tab state,
 * 3xxx payment rules, 4xxx bad request, 5xxx chain/system. Mirrored in packages/sdk (a test keeps them equal).
 */
export const ERROR_NUMBER: Record<ErrorCode | "INTERNAL", number> = {
  INVALID_CREDENTIAL: 1001,
  UNAUTHORIZED: 1002,
  TAB_NOT_FOUND: 2001,
  TAB_REVOKED: 2002,
  TAB_CLOSED: 2003,
  TAB_EXPIRED: 2004,
  NOT_ACTIVATED: 2005,
  PAYMENT_EXCEEDS_TAB_LIMIT: 3001,
  RECIPIENT_NOT_ALLOWED: 3002,
  INSUFFICIENT_TAB_BALANCE: 3003,
  UNSUPPORTED_MINT: 4001,
  UNSUPPORTED_PAYMENT_REQUIREMENT: 4002,
  DUPLICATE_REQUEST: 4003,
  BAD_REQUEST: 4004,
  INTERNAL: 5000,
  CHAIN_UNAVAILABLE: 5001,
  CHAIN_STATE_MISMATCH: 5002,
};

const DEFAULT_MESSAGE: Partial<Record<ErrorCode, string>> = {
  TAB_NOT_FOUND: "This tab doesn't exist or isn't active.",
  TAB_EXPIRED: "This tab has expired.",
  TAB_REVOKED: "The owner revoked this tab.",
  TAB_CLOSED: "This tab is closed.",
  INSUFFICIENT_TAB_BALANCE: "Not enough left on this tab for this payment.",
  PAYMENT_EXCEEDS_TAB_LIMIT: "This payment is above the tab's per-payment cap.",
  RECIPIENT_NOT_ALLOWED: "This service isn't on the tab's allowlist.",
  UNSUPPORTED_MINT: "This service doesn't accept the tab's token.",
  UNSUPPORTED_PAYMENT_REQUIREMENT: "This isn't an x402 V2 exact payment on this Solana network.",
  DUPLICATE_REQUEST: "This idempotency key was already used for a different request.",
  INVALID_CREDENTIAL: "The tab key is invalid or was rotated.",
  UNAUTHORIZED: "Sign in with your wallet.",
  CHAIN_UNAVAILABLE: "The Solana network didn't answer. Try again.",
};

export class TabError extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGE[code] ?? code);
  }
  get status() {
    return ERROR_STATUS[this.code];
  }
  get number() {
    return ERROR_NUMBER[this.code];
  }
}
