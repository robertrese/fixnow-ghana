BEGIN;

CREATE TABLE IF NOT EXISTS routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  agency_id uuid NOT NULL,
  response_target_id uuid,
  escalation_path_id uuid,
  priority integer NOT NULL DEFAULT 100,
  rule_version text NOT NULL,
  rationale text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES routing_rules(id),
  rule_version text NOT NULL,
  agency_id uuid NOT NULL,
  rationale text NOT NULL,
  recommendation_state text NOT NULL CHECK (recommendation_state IN ('recommended', 'accepted', 'overridden', 'dismissed')),
  engine_type text NOT NULL CHECK (engine_type IN ('rules', 'model-assisted')),
  model_version text NOT NULL DEFAULT '',
  override_agency_id uuid,
  override_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  routing_recommendation_id uuid REFERENCES routing_recommendations(id),
  state text NOT NULL CHECK (state IN ('Not sent', 'Queued', 'Sent', 'Delivered', 'Failed', 'Acknowledged')),
  channel text NOT NULL,
  integration_name text NOT NULL DEFAULT '',
  external_outcome_id text NOT NULL DEFAULT '',
  outcome_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state NOT IN ('Sent', 'Delivered', 'Acknowledged') OR (integration_name <> '' AND external_outcome_id <> ''))
);

CREATE INDEX IF NOT EXISTS routing_recommendations_report_idx ON routing_recommendations(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS delivery_attempts_report_idx ON delivery_attempts(report_id, created_at);

CREATE OR REPLACE FUNCTION derive_report_scope(point geometry, dataset text)
RETURNS TABLE(region_id text, mmda_id text)
LANGUAGE sql STABLE AS $$
  SELECT b.region_id, b.mmda_id
  FROM mmda_boundaries b
  WHERE b.dataset_id = dataset AND ST_Covers(b.boundary, point)
  LIMIT 1;
$$;

REVOKE ALL ON routing_rules, routing_recommendations, delivery_attempts FROM PUBLIC;

COMMIT;
