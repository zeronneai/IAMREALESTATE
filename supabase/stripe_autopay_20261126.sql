-- I AM Real Estate · Stripe automatic monthly payments (autopay). Nov 26, 2026. Safe to run again.
-- When a tenant or buyer turns on "Pay automatically every month" on their pay link, Stripe saves their card or bank
-- account and the portal charges it by itself on each due date (daily job). Finance can turn it off any time.
alter table obligations add column if not exists stripe_autopay boolean not null default false;
alter table obligations add column if not exists stripe_customer text;
alter table obligations add column if not exists stripe_pm text;          -- saved payment method id (no card numbers)
alter table obligations add column if not exists stripe_pm_type text;     -- card or us_bank_account
alter table obligations add column if not exists stripe_pm_label text;    -- e.g. "Visa ending 4242"
alter table obligations add column if not exists stripe_last_try text;    -- last period the portal tried to charge
alter table obligations add column if not exists stripe_last_error text;  -- why the last automatic charge failed
-- Website payments applied by Finance to a pending item keep a note of where they went.
alter table payments add column if not exists applied_to text;

select 'stripe_autopay_20261126 OK' as status,
  (select count(*) from information_schema.columns where table_name = 'obligations' and column_name like 'stripe_%') as stripe_columns;
