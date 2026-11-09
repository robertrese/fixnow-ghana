BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boundary_datasets (
  id text PRIMARY KEY,
  version text NOT NULL UNIQUE,
  publisher text NOT NULL,
  source_url text NOT NULL,
  source_date date NOT NULL,
  source_sha256 text NOT NULL,
  licence text NOT NULL,
  licence_status text NOT NULL CHECK (licence_status IN ('approved', 'production-review-required', 'retired')),
  active boolean NOT NULL DEFAULT false,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS boundary_datasets_one_active_idx
  ON boundary_datasets (active) WHERE active;

CREATE TABLE IF NOT EXISTS mmda_boundaries (
  dataset_id text NOT NULL REFERENCES boundary_datasets(id) ON DELETE RESTRICT,
  region_id text NOT NULL,
  region_name text NOT NULL,
  mmda_id text NOT NULL,
  mmda_name text NOT NULL,
  boundary geometry(MultiPolygon, 4326) NOT NULL,
  PRIMARY KEY (dataset_id, mmda_id)
);

CREATE INDEX IF NOT EXISTS mmda_boundaries_boundary_gix
  ON mmda_boundaries USING gist (boundary);

CREATE TABLE IF NOT EXISTS report_locations (
  report_id text PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  exact_point geometry(Point, 4326),
  private_location jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_location jsonb NOT NULL,
  public_location_label text NOT NULL,
  google_place_id text,
  location_source text NOT NULL CHECK (location_source IN ('gps', 'search', 'dropped-pin', 'ghanapostgps', 'manual')),
  accuracy_metres numeric CHECK (accuracy_metres BETWEEN 0 AND 100000),
  region_id text,
  mmda_id text,
  exact_location_consent boolean NOT NULL DEFAULT false,
  exact_location_consent_at timestamptz,
  verification_state text NOT NULL,
  location_quality text NOT NULL,
  location_confidence numeric NOT NULL CHECK (location_confidence BETWEEN 0 AND 1),
  boundary_dataset_id text NOT NULL REFERENCES boundary_datasets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((exact_point IS NULL AND exact_location_consent = false) OR
         (exact_point IS NOT NULL AND exact_location_consent = true AND exact_location_consent_at IS NOT NULL)),
  CHECK (exact_point IS NULL OR ST_SRID(exact_point) = 4326)
);

CREATE INDEX IF NOT EXISTS report_locations_exact_point_gix
  ON report_locations USING gist (exact_point) WHERE exact_point IS NOT NULL;
CREATE INDEX IF NOT EXISTS report_locations_scope_idx
  ON report_locations (region_id, mmda_id);

CREATE OR REPLACE VIEW public_report_locations AS
SELECT
  report_id,
  public_location,
  public_location_label,
  verification_state,
  location_quality,
  boundary_dataset_id
FROM report_locations;

REVOKE ALL ON report_locations FROM PUBLIC;
REVOKE ALL ON mmda_boundaries FROM PUBLIC;
GRANT SELECT ON public_report_locations TO fixnow_public;
GRANT SELECT, INSERT, UPDATE ON report_locations TO fixnow_api;
GRANT SELECT ON mmda_boundaries, boundary_datasets TO fixnow_api;

INSERT INTO schema_migrations (version)
VALUES ('20260808_001_secure_location')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Import validation must run in the deployment pipeline after loading boundaries:
-- SELECT count(*) = 261 FROM mmda_boundaries WHERE dataset_id = :dataset_id;
-- SELECT count(*) = 0 FROM mmda_boundaries WHERE NOT ST_IsValid(boundary);
-- Exact coordinates are matched with ST_Covers(boundary, exact_point); frontend labels are never trusted.
