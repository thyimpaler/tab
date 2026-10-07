// Dashboard API client. Every call times out to a visible error; no raw error JSON reaches the UI.

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

const FRIENDLY: Record<string, string> = {
  UNAUTHORIZED: "Your session ended. Sign in with your wallet again.",
  TAB_NOT_FOUND: "That tab doesn't exist or isn't yours.",
  CHAIN_UNAVAILABLE: "The Solana network didn't answer. Try again in a moment.",
  NOT_ACTIVATED: "The network hasn't confirmed the tab yet. Try again in a few seconds.",
  INTERNAL: "Something went wrong on our side. Try again.",
};

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    throw new ApiError("NETWORK", (e as Error).name === "TimeoutError" ? "TAB took too long to answer. Try again." : "Can't reach TAB. Check your connection.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.error?.code ?? "INTERNAL";
    throw new ApiError(code, FRIENDLY[code] ?? data?.error?.message ?? FRIENDLY.INTERNAL, res.status);
  }
  return data as T;
}

export type TabView = {
  id: string; label: string | null; status: "pending" | "active" | "expired" | "revoked" | "empty" | "closed";
  network: string; mint: string; decimals: number; tokenAccount: string; delegate: string;
  limit: string; spent: string; reserved: string; remaining: string; perPaymentCap: string | null;
  expiresAt: string; createdAt: string; revokedAt: string | null; closedAt: string | null;
  chain?: { amount: string; delegatedAmount: string; delegate: string | null } | null;
};

export type PaymentView = {
  id: string; amount: string; recipient: string; resource: string | null;
  state: "RESERVED" | "DISPATCHING" | "SETTLED" | "RELEASED" | "AMBIGUOUS";
  tx_signature: string | null; error_code: string | null; created_at: string; settled_at: string | null;
};

export type PublicConfig = { network: "devnet" | "mainnet"; caip2: string; mints: string[]; delegate: string; rpcUrl: string; demo: boolean };
