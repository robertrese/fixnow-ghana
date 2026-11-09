BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  agency text,
  region text,
  district text,
  status text NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  severity text,
  type text,
  region text,
  district text,
  community text,
  assigned_to text,
  assignment_user_id uuid REFERENCES users(id),
  assignment_state text NOT NULL DEFAULT 'unassigned',
  responsible_institution text NOT NULL DEFAULT '',
  public_verified boolean NOT NULL DEFAULT false,
  flagged boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  sla_due_at timestamptz,
  resolution_evidence_id uuid,
  resolution_exception text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_actor text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS reports_scope_idx ON reports(region, district, updated_at DESC);
CREATE INDEX IF NOT EXISTS reports_public_idx ON reports(public_verified, hidden, flagged, updated_at DESC);
CREATE INDEX IF NOT EXISTS reports_assignment_idx ON reports(assignment_user_id, assignment_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS reports_sla_idx ON reports(sla_due_at) WHERE status NOT IN ('Resolved', 'Rejected');

CREATE TABLE IF NOT EXISTS report_tracking (
  report_id text PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  tracking_reference text NOT NULL UNIQUE,
  secret_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  public_update text NOT NULL DEFAULT '',
  private_note text NOT NULL DEFAULT '',
  actor_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_history_report_idx ON report_history(report_id, created_at);

CREATE TABLE IF NOT EXISTS private_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  object_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  detected_mime text NOT NULL CHECK (detected_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 750000),
  payload_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('citizen-evidence', 'responder-evidence', 'resolution-evidence')),
  quarantine_state text NOT NULL CHECK (quarantine_state IN ('pending', 'clean', 'rejected')),
  scan_result text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS private_attachments_report_idx ON private_attachments(report_id, quarantine_state);

REVOKE ALL ON users, report_tracking, report_history, private_attachments FROM PUBLIC;

COMMIT;
