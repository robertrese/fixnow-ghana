# Location Data And Privacy

## Active development boundary dataset

- Dataset: Ghana Statistical Service 2021 Population and Housing Census, 261 administrative MMDAs
- Publisher: Ghana Statistical Service (GSS)
- Source page: <https://statsbank.statsghana.gov.gh/censusatlas/>
- Download: <https://statsbank.statsghana.gov.gh/assets/geofiles.zip>
- Source archive SHA-256: `A37F1F556283F825194B5A4251F17526E98A2797B273D604E0022A35F67518BB`
- Runtime TopoJSON SHA-256: `EE3A8BF615AE52457BA500E814E495222D6902BFF4B618FA5DD99414971BDFA4`
- Source file date: 2023-10-05
- Administrative reference: 2021 PHC, census night 2021-06-27
- CRS: WGS 84 longitude/latitude
- Feature count: 261

The source exposes region and district names, but no stable numeric MMDA field. Development IDs therefore use a version-qualified SHA-256 digest of the official region and district labels. They must not be treated as GSS-issued codes.

## Production approval gate

The repository records the source and hashes, but redistribution and production-use rights still require written confirmation from GSS or the relevant data owner. `boundary-dataset.json` deliberately keeps `licenceStatus` at `production-review-required`. Deployment must reject an active production dataset whose licence status is not `approved`.

Before replacing a dataset:

1. Download only from an official publisher URL.
2. Record the download date, source date, licence, and SHA-256 hashes.
3. Import into a new version; never overwrite an active version in place.
4. Validate the expected feature count, geometry validity, CRS, labels, and representative control points.
5. Review renamed or split MMDAs and routing implications.
6. Switch the active version in one transaction and retain the version used for every report.

## Privacy model

Exact latitude/longitude and GhanaPostGPS values are private report data. The API accepts them only after explicit per-report consent. Exact coordinates are validated, matched against the active boundary geometry, and stored separately from report content. Public serializers expose only a redacted community/MMDA/region representation and never return exact coordinates, digital addresses, Google Place IDs, accuracy, contact data, or private notes.

An authenticated responder can retrieve an exact point only through the dedicated report-location endpoint, after role and geographic scope checks. Access is audit logged. Public text is also filtered for coordinate-pair and GhanaPostGPS patterns to reduce accidental disclosure.

## PostgreSQL/PostGIS migration

SQLite remains the local-development store. The controlled-pilot target is PostgreSQL with PostGIS, using `deploy/postgres/001_secure_location.sql` as the first location migration. The production importer must load each official MMDA as `geometry(MultiPolygon, 4326)`, validate with `ST_IsValid`, and match reports with `ST_Covers` using a GiST index.

The application database role must not be used by public clients. Public API code reads only `public_report_locations`; exact points require an authenticated server path and an in-scope responder. Database encryption at rest, encrypted backups, restricted operator access, restoration tests, and access-log review remain deployment requirements.
