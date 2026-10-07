-- 008_feedlots.sql - the feedlot directory. Staff add, edit and remove feedlots here;
-- later releases send showlists to the ones with email addresses. This list lives only
-- in the Red Angus database (it is copied to BlockTrust later).
CREATE TABLE feedlots (
  id                bigserial PRIMARY KEY,
  name              text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  contact_name      text CHECK (length(contact_name) <= 150),
  address           text CHECK (length(address) <= 200),
  city              text CHECK (length(city) <= 100),
  state             char(2) NOT NULL,
  zip               text CHECK (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  phone             text CHECK (length(phone) <= 100),
  -- A feedlot can have more than one email address; each one is kept as typed (lower case).
  emails            text[] NOT NULL DEFAULT '{}' CHECK (cardinality(emails) <= 5),
  -- Fax numbers are typed in by staff; nothing sends to them yet.
  fax               text CHECK (length(fax) <= 100),
  website           text CHECK (length(website) <= 200),
  -- Staff only; never shown to members or visitors.
  notes             text CHECK (length(notes) <= 2000),
  -- Off = retired. Hidden from members and left out of showlists, but the record stays.
  enabled           boolean NOT NULL DEFAULT true,
  -- Set by staff now, and by the unsubscribe link in a later release.
  do_not_email      boolean NOT NULL DEFAULT false,
  do_not_email_at   timestamptz,
  do_not_email_note text CHECK (length(do_not_email_note) <= 500),
  created_by        bigint REFERENCES users(id),
  updated_by        bigint REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedlots_name_idx ON feedlots (lower(name), id);
CREATE INDEX feedlots_state_idx ON feedlots (state);
-- The same yard cannot be added twice (same name, city and state, ignoring case).
CREATE UNIQUE INDEX feedlots_unique_yard_idx ON feedlots (lower(btrim(name)), lower(btrim(coalesce(city, ''))), state);

-- Every change made through the portal. feedlot_id has no foreign key on purpose, so the
-- record of a removed feedlot stays (its name is kept in old_value of the 'deleted' line).
CREATE TABLE feedlot_log (
  id          bigserial PRIMARY KEY,
  feedlot_id  bigint NOT NULL,
  field       text NOT NULL,
  old_value   text,
  new_value   text,
  changed_by  bigint NOT NULL REFERENCES users(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedlot_log_feedlot_idx ON feedlot_log (feedlot_id, changed_at DESC);
