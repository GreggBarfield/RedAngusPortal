-- 007_photos_attachments.sql - photos and attachments on the new listings.
-- Photo files live in BTN's S3 bucket under listings/raa/; attachment files live in a
-- folder on the BTN server. These tables only keep where each file is and what it is.
-- Each row belongs to exactly one feeder listing or one breeding listing.

CREATE TABLE raa_listing_photos (
  id                  bigserial PRIMARY KEY,
  feeder_listing_id   bigint REFERENCES feeder_listings(id) ON DELETE CASCADE,
  breeding_listing_id bigint REFERENCES breeding_listings(id) ON DELETE CASCADE,
  s3_key              text NOT NULL UNIQUE,
  s3_key_medium       text NOT NULL,
  s3_key_thumb        text NOT NULL,
  content_type        text NOT NULL DEFAULT 'image/jpeg',
  file_size_bytes     integer NOT NULL CHECK (file_size_bytes > 0),
  width               integer,
  height              integer,
  display_order       integer NOT NULL DEFAULT 0,
  is_cover            boolean NOT NULL DEFAULT false,
  uploaded_by         bigint NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((feeder_listing_id IS NULL) <> (breeding_listing_id IS NULL)),
  CHECK (s3_key LIKE 'listings/raa/%' AND s3_key_medium LIKE 'listings/raa/%' AND s3_key_thumb LIKE 'listings/raa/%')
);
CREATE INDEX raa_listing_photos_feeder_idx ON raa_listing_photos (feeder_listing_id, display_order, id) WHERE feeder_listing_id IS NOT NULL;
CREATE INDEX raa_listing_photos_breeding_idx ON raa_listing_photos (breeding_listing_id, display_order, id) WHERE breeding_listing_id IS NOT NULL;
-- one cover photo per listing
CREATE UNIQUE INDEX raa_listing_photos_feeder_cover ON raa_listing_photos (feeder_listing_id) WHERE is_cover AND feeder_listing_id IS NOT NULL;
CREATE UNIQUE INDEX raa_listing_photos_breeding_cover ON raa_listing_photos (breeding_listing_id) WHERE is_cover AND breeding_listing_id IS NOT NULL;

CREATE TABLE raa_listing_attachments (
  id                  bigserial PRIMARY KEY,
  feeder_listing_id   bigint REFERENCES feeder_listings(id) ON DELETE CASCADE,
  breeding_listing_id bigint REFERENCES breeding_listings(id) ON DELETE CASCADE,
  stored_name         text NOT NULL UNIQUE,
  orig_name           text NOT NULL,
  file_ext            text NOT NULL,
  mime_type           text NOT NULL,
  file_size           integer NOT NULL CHECK (file_size > 0),
  doc_type            text NOT NULL DEFAULT 'other'
                      CHECK (doc_type IN ('health_records', 'pedigree', 'epd_report', 'sale_sheet', 'other')),
  uploaded_by         bigint NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((feeder_listing_id IS NULL) <> (breeding_listing_id IS NULL))
);
CREATE INDEX raa_listing_attachments_feeder_idx ON raa_listing_attachments (feeder_listing_id, id) WHERE feeder_listing_id IS NOT NULL;
CREATE INDEX raa_listing_attachments_breeding_idx ON raa_listing_attachments (breeding_listing_id, id) WHERE breeding_listing_id IS NOT NULL;
