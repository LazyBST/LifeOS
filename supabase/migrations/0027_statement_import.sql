-- Bank/UPI statement import: remember where a transaction came from and its bank reference, so the same payment
-- seen in two statements (e.g. Federal and PhonePe share the UPI reference) is recognised and never added twice.
alter table transactions add column if not exists source text;     -- 'federal' | 'hdfc' | 'phonepe' (null = entered by hand)
alter table transactions add column if not exists ext_ref text;    -- normalised bank reference (UPI RRN, NEFT/ACH ref)
create index if not exists transactions_ext_ref_idx on transactions (ext_ref) where ext_ref is not null;
