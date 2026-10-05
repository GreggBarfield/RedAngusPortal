-- Breed makeup on feeder listings: the seller may give each breed either a percent or a head count.
-- breed_mode says which one was used (NULL = no amounts given); amount belongs to one breed row.
ALTER TABLE feeder_listings ADD COLUMN breed_mode text CHECK (breed_mode IN ('percent', 'head'));
ALTER TABLE feeder_listing_breeds ADD COLUMN amount numeric(8, 2);
