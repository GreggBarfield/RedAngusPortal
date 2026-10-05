-- 005_new_listing_forms.sql - listing tables for the BlockTrust-style forms.
-- Feeder cattle and breeding cattle each get a main table plus child tables for the
-- multi-select and repeating parts of the form. The old feeder_lots and listings tables
-- are left alone (the live screens still use them until the new screens ship).
-- Same approval rules as before: new and edited listings wait for staff ('pending').

CREATE TABLE feeder_listings (
  id                bigserial PRIMARY KEY,
  owner_id          bigint NOT NULL REFERENCES users(id),
  group_id          text NOT NULL,
  group_id_optout   boolean NOT NULL DEFAULT false,
  headline          text NOT NULL,
  steer_count       integer NOT NULL DEFAULT 0 CHECK (steer_count BETWEEN 0 AND 5000),
  heifer_count      integer NOT NULL DEFAULT 0 CHECK (heifer_count BETWEEN 0 AND 5000),
  head_count        integer GENERATED ALWAYS AS (steer_count + heifer_count) STORED,
  avg_weight_steers   integer CHECK (avg_weight_steers BETWEEN 150 AND 1500),
  avg_weight_heifers  integer CHECK (avg_weight_heifers BETWEEN 150 AND 1500),
  avg_weight        integer CHECK (avg_weight BETWEEN 150 AND 1500),
  birth_date        date,
  wean_date         date,
  vet_name          text,
  birth_country     text NOT NULL DEFAULT 'United States',
  description       text,
  nutrition         text,
  marketing_method  text NOT NULL CHECK (marketing_method IN ('auction', 'off_ranch', 'video_auction')),
  auction_no        integer,
  auction_name      text,
  marketing_date    date NOT NULL,
  tag_visual_start  text,
  tag_visual_end    text,
  tag_eid_start     text,
  tag_eid_end       text,
  city              text,
  state             char(2) NOT NULL,
  zip               char(5) NOT NULL,
  lat               numeric(9,6),
  lon               numeric(9,6),
  price_basis       text CHECK (price_basis IN ('per_cwt', 'per_head')),
  asking_price      numeric(10,2) CHECK (asking_price >= 0),
  call_for_price    boolean NOT NULL DEFAULT false,
  contact_name      text NOT NULL,
  contact_phone     text NOT NULL,
  contact_email     text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'sold', 'withdrawn')),
  review_note       text,
  reviewed_by       bigint REFERENCES users(id),
  reviewed_at       timestamptz,
  approved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (steer_count + heifer_count >= 1),
  CHECK (NOT (call_for_price AND asking_price IS NOT NULL)),
  CHECK ((asking_price IS NULL) = (price_basis IS NULL))
);

CREATE INDEX feeder_listings_public_idx ON feeder_listings (marketing_date) WHERE status = 'approved';
CREATE INDEX feeder_listings_state_idx ON feeder_listings (state) WHERE status = 'approved';
CREATE INDEX feeder_listings_owner_idx ON feeder_listings (owner_id, created_at DESC);
CREATE INDEX feeder_listings_queue_idx ON feeder_listings (status, created_at);

CREATE TABLE feeder_listing_breeds (
  id          bigserial PRIMARY KEY,
  listing_id  bigint NOT NULL REFERENCES feeder_listings(id) ON DELETE CASCADE,
  breed_name  text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX feeder_listing_breeds_idx ON feeder_listing_breeds (listing_id);

-- program_type: PC = preconditioning, SP = special program (same codes BTN uses).
CREATE TABLE feeder_listing_programs (
  id            bigserial PRIMARY KEY,
  listing_id    bigint NOT NULL REFERENCES feeder_listings(id) ON DELETE CASCADE,
  program_name  text NOT NULL,
  program_type  char(2) NOT NULL CHECK (program_type IN ('PC', 'SP')),
  sort_order    integer NOT NULL DEFAULT 0
);
CREATE INDEX feeder_listing_programs_idx ON feeder_listing_programs (listing_id);

CREATE TABLE feeder_listing_vaccinations (
  id          bigserial PRIMARY KEY,
  listing_id  bigint NOT NULL REFERENCES feeder_listings(id) ON DELETE CASCADE,
  vac_date    date,
  product     text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX feeder_listing_vaccinations_idx ON feeder_listing_vaccinations (listing_id);

CREATE TABLE breeding_listings (
  id              bigserial PRIMARY KEY,
  owner_id        bigint NOT NULL REFERENCES users(id),
  head_count      integer NOT NULL DEFAULT 1 CHECK (head_count BETWEEN 1 AND 5000),
  sex_class       text NOT NULL
                  CHECK (sex_class IN ('bull', 'open_heifer', 'bred_heifer', 'cow', 'cow_calf', 'embryo_semen')),
  birth_date      date,
  reg_number      text,
  breed_class     text CHECK (breed_class IN ('purebred', 'percentage', 'composite', 'commercial')),
  primary_breed   text,
  sire            text,
  dam             text,
  headline        text NOT NULL,
  description     text,
  sale_title      text,
  sale_type       text NOT NULL CHECK (sale_type IN ('auction', 'private_treaty', 'off_ranch', 'video_auction')),
  auction_no      integer,
  auction_name    text,
  sale_date       date NOT NULL,
  city            text,
  state           char(2) NOT NULL,
  zip             char(5) NOT NULL,
  lat             numeric(9,6),
  lon             numeric(9,6),
  asking_price    numeric(10,2) CHECK (asking_price >= 0),
  call_for_price  boolean NOT NULL DEFAULT false,
  contact_name    text NOT NULL,
  contact_phone   text NOT NULL,
  contact_email   text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'sold', 'withdrawn')),
  review_note     text,
  reviewed_by     bigint REFERENCES users(id),
  reviewed_at     timestamptz,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (call_for_price AND asking_price IS NOT NULL))
);

CREATE INDEX breeding_listings_public_idx ON breeding_listings (sale_date) WHERE status = 'approved';
CREATE INDEX breeding_listings_state_idx ON breeding_listings (state) WHERE status = 'approved';
CREATE INDEX breeding_listings_owner_idx ON breeding_listings (owner_id, created_at DESC);
CREATE INDEX breeding_listings_queue_idx ON breeding_listings (status, created_at);

CREATE TABLE breeding_listing_breeds (
  id          bigserial PRIMARY KEY,
  listing_id  bigint NOT NULL REFERENCES breeding_listings(id) ON DELETE CASCADE,
  breed_name  text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX breeding_listing_breeds_idx ON breeding_listing_breeds (listing_id);

-- One row per EPD trait the seller entered. A blank value or the Unknown box means unknown = true.
CREATE TABLE breeding_listing_epds (
  id          bigserial PRIMARY KEY,
  listing_id  bigint NOT NULL REFERENCES breeding_listings(id) ON DELETE CASCADE,
  trait_code  text NOT NULL,
  value       numeric(12,4),
  unknown     boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  CHECK (unknown = (value IS NULL))
);
CREATE INDEX breeding_listing_epds_idx ON breeding_listing_epds (listing_id, trait_code);

CREATE TABLE saved_filters (
  id          bigserial PRIMARY KEY,
  owner_id    bigint NOT NULL REFERENCES users(id),
  kind        text NOT NULL CHECK (kind IN ('feeder', 'breeding')),
  name        text NOT NULL,
  params      jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, kind, name)
);
