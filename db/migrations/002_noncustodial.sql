-- 002: non-custodial delegate model (decided 2026-10-07 by owner: no server-held balance).
-- Each TAB is a dedicated SPL token account owned by the user's wallet, with an allowance
-- approved to our delegate. Adds the pending status, chain metadata and signing records.

ALTER TYPE tab_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'active';

ALTER TABLE tabs
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN credential_hash DROP NOT NULL,          -- set at activation, shown once
  ADD COLUMN network         text NOT NULL DEFAULT 'devnet',
  ADD COLUMN token_program   text NOT NULL DEFAULT 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ADD COLUMN decimals        smallint NOT NULL DEFAULT 6,
  ADD COLUMN create_signature text,
  ADD COLUMN activated_at    timestamptz;

ALTER TABLE tabs ALTER COLUMN network DROP DEFAULT;
ALTER TABLE tabs ALTER COLUMN token_program DROP DEFAULT;
ALTER TABLE tabs ALTER COLUMN decimals DROP DEFAULT;

ALTER TABLE payments
  ADD COLUMN request_hash            text NOT NULL DEFAULT '',
  ADD COLUMN delegate_signature      text,             -- our signature inside the tx
  ADD COLUMN last_valid_block_height bigint,            -- tx cannot land after this
  ADD COLUMN payment_header          text,              -- PAYMENT-SIGNATURE value, replayed on same key
  ADD COLUMN network                 text,
  ADD COLUMN settled_at              timestamptz;

ALTER TABLE payments ALTER COLUMN request_hash DROP DEFAULT;

CREATE TABLE auth_nonces (
  nonce       text PRIMARY KEY,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
