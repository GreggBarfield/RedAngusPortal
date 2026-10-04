-- 002_barn_settings.sql - RAA's own settings for sale barns, plus a log of
-- every contact change made through the portal (those changes are also
-- written to BTN's auction_barns table).
-- auction_no is BTN's key. There is no foreign key because the barn list
-- lives in BTN's database.
CREATE TABLE barn_settings (
  auction_no  integer PRIMARY KEY,
  send_method text CHECK (send_method IN ('email', 'fax')),
  enabled     boolean NOT NULL DEFAULT true,
  notes       text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  bigint REFERENCES users(id)
);

CREATE TABLE barn_contact_log (
  id          bigserial PRIMARY KEY,
  auction_no  integer NOT NULL,
  field       text NOT NULL CHECK (field IN ('email', 'phone', 'fax', 'contactName')),
  old_value   text,
  new_value   text,
  overwrote   boolean NOT NULL DEFAULT false,
  changed_by  bigint NOT NULL REFERENCES users(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX barn_contact_log_barn_idx ON barn_contact_log (auction_no, changed_at DESC);
