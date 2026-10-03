-- 001_users.sql - user accounts for the Red Angus Portal.
-- role: member (RAA member), barn (approved sale barn), staff (RAA staff).
-- membership_status: unverified until a check method is decided and run.
CREATE TABLE users (
  id                bigserial PRIMARY KEY,
  email             text        NOT NULL,
  password_hash     text        NOT NULL,
  display_name      text        NOT NULL,
  membership_number text,
  membership_status text        NOT NULL DEFAULT 'unverified'
                    CHECK (membership_status IN ('unverified', 'verified', 'rejected')),
  role              text        NOT NULL DEFAULT 'member'
                    CHECK (role IN ('member', 'barn', 'staff')),
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz
);

CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
CREATE INDEX users_membership_number_idx ON users (membership_number)
  WHERE membership_number IS NOT NULL;
