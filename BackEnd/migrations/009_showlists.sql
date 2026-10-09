-- 009_showlists.sql - showlist emails to feedlots.
-- showlists: one row each time staff send a list of available cattle. lots keeps a copy of
-- the cattle exactly as they were sent, so the record never changes when a listing is edited.
-- showlist_sends: one row per email address. The row id is the number put in the subject
-- line as [ref:NNNN]; the delivery report from SMTP2GO is matched back to the row with it.
-- feedlot_id has no foreign key on purpose (a removed feedlot keeps its send record).
CREATE TABLE showlists (
  id               bigserial PRIMARY KEY,
  subject          text NOT NULL,
  intro            text,
  lots             jsonb NOT NULL,
  recipient_count  integer NOT NULL DEFAULT 0,
  created_by       bigint NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE showlist_sends (
  id               bigserial PRIMARY KEY,
  showlist_id      bigint NOT NULL REFERENCES showlists(id) ON DELETE CASCADE,
  feedlot_id       bigint NOT NULL,
  feedlot_name     text NOT NULL,
  recipient        text NOT NULL,
  token            text NOT NULL,
  status           text NOT NULL DEFAULT 'QUEUED'
                   CHECK (status IN ('QUEUED', 'SENDING', 'SUBMITTED', 'DELIVERED', 'FAILED', 'SUBMIT_FAILED')),
  status_detail    text,
  smtp2go_email_id text,
  queued_at        timestamptz NOT NULL DEFAULT now(),
  submitted_at     timestamptz,
  delivered_at     timestamptz,
  failed_at        timestamptz,
  unsubscribed_at  timestamptz
);

CREATE UNIQUE INDEX showlist_sends_token_idx ON showlist_sends (token);
CREATE INDEX showlist_sends_showlist_idx ON showlist_sends (showlist_id, status);
CREATE INDEX showlist_sends_feedlot_idx ON showlist_sends (feedlot_id, submitted_at DESC);
