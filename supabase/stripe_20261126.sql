-- I AM Real Estate · Online payments with Stripe (rent, wrap and loan payments). Nov 26, 2026. Safe to run again.
-- Each payment line (obligation) that is collected (rent, wrap, loan) gets a private pay link: /pay/?t=<token>.
-- The tenant or buyer pays by card or bank account (ACH) on Stripe; the portal marks that month as received by itself.
alter table obligations add column if not exists pay_token text;
create unique index if not exists obligations_pay_token_idx on obligations(pay_token) where pay_token is not null;
alter table payments add column if not exists stripe_ref text;   -- Stripe Checkout session or payment id (no double counting)

select 'stripe_20261126 OK' as status,
  (select count(*) from information_schema.columns where table_name = 'obligations' and column_name = 'pay_token') as pay_token_column,
  (select count(*) from information_schema.columns where table_name = 'payments' and column_name = 'stripe_ref') as stripe_ref_column;
