-- 003_listings.sql - breeding bull and female listings.
-- New and edited listings wait for staff approval ('pending').
CREATE TABLE listings (
  id               bigserial PRIMARY KEY,
  owner_id         bigint NOT NULL REFERENCES users(id),
  kind             text NOT NULL CHECK (kind IN ('bull', 'cow', 'heifer', 'bred_heifer', 'pair')),
  name             text NOT NULL,
  reg_number       text,
  tag              text,
  birth_date       date NOT NULL,
  sire_name        text,
  sire_reg         text,
  dam_name         text,
  dam_reg          text,
  birth_weight     integer CHECK (birth_weight BETWEEN 20 AND 200),
  weaning_weight   integer CHECK (weaning_weight BETWEEN 200 AND 1000),
  yearling_weight  integer CHECK (yearling_weight BETWEEN 400 AND 2500),
  scrotal          numeric(4,1) CHECK (scrotal BETWEEN 20 AND 60),
  bred_to          text,
  due_date         date,
  head_count       integer NOT NULL DEFAULT 1 CHECK (head_count BETWEEN 1 AND 500),
  city             text NOT NULL,
  state            char(2) NOT NULL,
  zip              char(5) NOT NULL,
  asking_price     numeric(10,2) CHECK (asking_price >= 0),
  call_for_price   boolean NOT NULL DEFAULT false,
  description      text,
  contact_name     text NOT NULL,
  contact_phone    text NOT NULL,
  contact_email    text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'sold', 'withdrawn')),
  review_note      text,
  reviewed_by      bigint REFERENCES users(id),
  reviewed_at      timestamptz,
  approved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (call_for_price AND asking_price IS NOT NULL))
);

CREATE INDEX listings_public_idx ON listings (approved_at DESC) WHERE status = 'approved';
CREATE INDEX listings_owner_idx ON listings (owner_id, created_at DESC);
CREATE INDEX listings_queue_idx ON listings (status, created_at);
