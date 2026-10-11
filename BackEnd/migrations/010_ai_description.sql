-- 010_ai_description.sql - listing notes written with AI for feeder listings.
-- The seller ticks a box to include them, can read and change the text, and staff see the
-- final text when they approve the listing. Shown on the listing page and on the data sheet.
-- Nothing else changes: existing listings simply have no notes (include_ai = false).

ALTER TABLE feeder_listings
  ADD COLUMN include_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_description text CHECK (ai_description IS NULL OR char_length(ai_description) <= 2000);
