-- 004_feeder_lots.sql - feeder cattle sold as a lot (a group of calves or yearlings).
-- Same approval rules as breeding listings: new and edited lots wait for staff ('pending').
CREATE TABLE feeder_lots (
  id               bigserial PRIMARY KEY,
  owner_id         bigint NOT NULL REFERENCES users(id),
  title            text NOT NULL,
  head_count       integer NOT NULL CHECK (head_count BETWEEN 1 AND 5000),
  sex              text NOT NULL CHECK (sex IN ('steers', 'heifers', 'bulls', 'mixed')),
  avg_weight       integer NOT NULL CHECK (avg_weight BETWEEN 150 AND 1500),
  weight_low       integer CHECK (weight_low BETWEEN 150 AND 1500),
  weight_high      integer CHECK (weight_high BETWEEN 150 AND 1500),
  breed            text,
  age_months       integer CHECK (age_months BETWEEN 1 AND 36),
  weaned           boolean NOT NULL DEFAULT false,
  weaned_days      integer CHECK (weaned_days BETWEEN 0 AND 365),
  health_program   text,
  horn_status      text CHECK (horn_status IN ('polled', 'dehorned', 'horned', 'mixed')),
  bunk_broke       boolean NOT NULL DEFAULT false,
  sired_by         text,
  sale_type        text CHECK (sale_type IN ('private_treaty', 'contract', 'video')),
  available_date   date,
  city             text NOT NULL,
  state            char(2) NOT NULL,
  zip              char(5) NOT NULL,
  price_basis      text CHECK (price_basis IN ('per_cwt', 'per_head')),
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
  CHECK (NOT (call_for_price AND asking_price IS NOT NULL)),
  CHECK ((asking_price IS NULL) = (price_basis IS NULL))
);

CREATE INDEX feeder_lots_public_idx ON feeder_lots (approved_at DESC) WHERE status = 'approved';
CREATE INDEX feeder_lots_owner_idx ON feeder_lots (owner_id, created_at DESC);
CREATE INDEX feeder_lots_queue_idx ON feeder_lots (status, created_at);
