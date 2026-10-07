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

export class TabError extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? code);
  }
  get status() {
    return ERROR_STATUS[this.code];
  }
}
