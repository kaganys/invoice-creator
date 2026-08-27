-- Distinguish card / wallet / ACH on payment audit and Stripe intents.
-- No PAN, CVC, account numbers, or secrets.

ALTER TABLE invoice_payments ADD COLUMN payment_category TEXT;
ALTER TABLE invoice_payments ADD COLUMN payment_method_type TEXT;
ALTER TABLE invoice_payments ADD COLUMN wallet_type TEXT;
ALTER TABLE invoice_payments ADD COLUMN surcharge_cents INTEGER;

ALTER TABLE invoice_stripe_intents ADD COLUMN confirmation_token_id TEXT;
ALTER TABLE invoice_stripe_intents ADD COLUMN status TEXT;
ALTER TABLE invoice_stripe_intents ADD COLUMN payment_category TEXT;
ALTER TABLE invoice_stripe_intents ADD COLUMN payment_method_type TEXT;

ALTER TABLE invoices ADD COLUMN stripe_payment_method TEXT;
ALTER TABLE invoices ADD COLUMN stripe_wallet_type TEXT;
ALTER TABLE invoices ADD COLUMN stripe_payment_status TEXT;
