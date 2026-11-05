-- Statement import: remember where a transaction came from. Safe to run twice.

-- where an imported transaction came from, and its bank reference, so the same payment seen in two statements
-- (Federal and PhonePe share the UPI reference) is recognised and never added twice
alter table transactions add column if not exists source text;     -- 'federal' | 'hdfc' | 'phonepe' (null = entered by hand)
alter table transactions add column if not exists ext_ref text;    -- normalised bank reference (UPI RRN, NEFT/ACH ref)
create index if not exists transactions_ext_ref_idx on transactions (ext_ref) where ext_ref is not null;

-- the last 4 digits of the account number printed on its statement: lets PhonePe's "paid by ...5047" find the account
alter table accounts add column if not exists number_last4 text;
