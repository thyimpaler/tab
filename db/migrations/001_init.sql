-- TAB schema (PostgreSQL). All money is integer base units (bigint).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE tab_status AS ENUM ('active', 'expired', 'revoked', 'empty', 'closed');

CREATE TABLE tabs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL REFERENCES users(id),
  label             text,
  mint              text NOT NULL,               -- never hardcode USDC in logic
  token_account     text,                        -- dedicated token account holding the funds
  delegate_pubkey   text,                        -- delegate approved on that account
  limit_amount      bigint NOT NULL CHECK (limit_amount > 0),
  spent_amount      bigint NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  reserved_amount   bigint NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  per_payment_cap   bigint CHECK (per_payment_cap > 0),
  expires_at        timestamptz NOT NULL,
  status            tab_status NOT NULL DEFAULT 'active',
  credential_hash   text NOT NULL UNIQUE,        -- hash only; secret shown once
  created_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  closed_at         timestamptz,
  -- invariant 1: can never be over-committed
  CONSTRAINT tab_never_overspent CHECK (spent_amount + reserved_amount <= limit_amount)
);

CREATE INDEX tabs_owner_idx ON tabs(owner_id);
CREATE INDEX tabs_status_expiry_idx ON tabs(status, expires_at);

CREATE TABLE allowed_recipients (
  tab_id    uuid NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  PRIMARY KEY (tab_id, recipient)
);

CREATE TYPE payment_state AS ENUM ('RESERVED', 'DISPATCHING', 'SETTLED', 'RELEASED', 'AMBIGUOUS');

CREATE TABLE payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id           uuid NOT NULL REFERENCES tabs(id),
  idempotency_key  text NOT NULL,
  amount           bigint NOT NULL CHECK (amount > 0),
  recipient        text NOT NULL,
  resource         text,                         -- url / endpoint paid for
  protocol         text NOT NULL DEFAULT 'x402',
  state            payment_state NOT NULL DEFAULT 'RESERVED',
  tx_signature     text,
  error_code       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- invariant 3: same key never pays twice
  CONSTRAINT payments_idempotent UNIQUE (tab_id, idempotency_key)
);

CREATE INDEX payments_tab_idx ON payments(tab_id, created_at DESC);
-- used by crash recovery to find stuck reservations
CREATE INDEX payments_stuck_idx ON payments(state, updated_at)
  WHERE state IN ('RESERVED', 'DISPATCHING', 'AMBIGUOUS');
