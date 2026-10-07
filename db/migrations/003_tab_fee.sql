-- 003: tab opening fee (owner decision 2026-10-07: 0.2 USDC per tab, to the owner's treasury wallet).
-- Paid inside the same transaction that creates and funds the tab account, so an activated tab
-- implies the fee was paid. Recorded per tab for accounting.
ALTER TABLE tabs
  ADD COLUMN fee_amount bigint NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  ADD COLUMN fee_recipient text;
