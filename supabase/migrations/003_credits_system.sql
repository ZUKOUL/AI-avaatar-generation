-- Credits system: balance on users + transaction ledger.
-- Run after 002 or after your existing users table.

-- ─── Add credit balance to users ────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS credit_balance integer NOT NULL DEFAULT 0;

-- ─── Credit transactions ledger ─────────────────────────────────────────────
-- Types: 'purchase', 'image_generation', 'video_generation', 'refund', 'admin_adjustment'
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users (id),
  amount            integer NOT NULL,       -- positive = add, negative = deduct
  type              text NOT NULL,
  description       text,
  stripe_session_id text,                   -- only for purchase transactions
  balance_after     integer NOT NULL,       -- snapshot of balance after this txn
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id
  ON public.credit_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe_session
  ON public.credit_transactions (stripe_session_id);

COMMENT ON TABLE public.credit_transactions IS 'Ledger of all credit mutations: purchases, deductions, refunds';
