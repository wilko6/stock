-- Rename storage location "Usine" to "Stock"
--
-- NOTE on constraint names:
--   The DROP CONSTRAINT statements below use the names Postgres auto-generates
--   for unnamed CHECK constraints (<table>_<column>_check). If your DB was
--   created with different constraint names (e.g. because the original CHECKs
--   were named explicitly, or a tool created them), inspect with:
--     SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
--     FROM pg_constraint
--     WHERE contype = 'c'
--       AND conrelid::regclass::text IN ('stock', 'deliveries', 'payments');
--   then adjust the DROP statements to match. The IF EXISTS clauses make the
--   DROPs safe to re-run.
--
-- Run this in the Supabase SQL editor.

BEGIN;

-- 1. Drop existing CHECK constraints referencing 'Usine'
ALTER TABLE stock      DROP CONSTRAINT IF EXISTS stock_location_check;
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_source_check;
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_destination_check;
ALTER TABLE payments   DROP CONSTRAINT IF EXISTS payments_source_check;

-- 2. Update data: rewrite 'Usine' to 'Stock' on every column that stored it
UPDATE stock      SET location    = 'Stock' WHERE location    = 'Usine';
UPDATE deliveries SET source      = 'Stock' WHERE source      = 'Usine';
UPDATE deliveries SET destination = 'Stock' WHERE destination = 'Usine';
UPDATE payments   SET source      = 'Stock' WHERE source      = 'Usine';

-- 3. Re-add CHECK constraints with the new allowed set
ALTER TABLE stock
  ADD CONSTRAINT stock_location_check
  CHECK (location IN ('Stock', 'Boutique 1', 'Boutique 2', 'Boutique 3'));

ALTER TABLE deliveries
  ADD CONSTRAINT deliveries_source_check
  CHECK (source IN ('Stock', 'Boutique 1', 'Boutique 2', 'Boutique 3'));

ALTER TABLE deliveries
  ADD CONSTRAINT deliveries_destination_check
  CHECK (destination IN ('Stock', 'Boutique 1', 'Boutique 2', 'Boutique 3'));

ALTER TABLE payments
  ADD CONSTRAINT payments_source_check
  CHECK (source IN ('Stock', 'Boutique 1', 'Boutique 2', 'Boutique 3'));

COMMIT;
