-- 24-72h PM2.5 forecast per CPCB station, using BigQuery's built-in
-- AI.FORECAST (TimesFM 2.5, Apache-2.0 licensed model — we do not train our
-- own model). Source table `nivaran_air.cpcb_station_hourly` is loaded by
-- fetch_cpcb.py from the Vonter/india-cpcb-aqi dataset (CPCB data, ODbL 1.0,
-- must credit: https://github.com/Vonter/india-cpcb-aqi).
--
-- Run once by hand, or schedule as a recurring BigQuery scheduled query:
--   bq query --use_legacy_sql=false --project_id=YOUR_PROJECT \
--     --schedule='every 6 hours' \
--     --display_name='Nivaran PM2.5 forecast' \
--     --destination_table=nivaran_air.pm25_forecast \
--     --replace \
--     "$(cat pipeline/bq_forecast.sql)"
-- (or paste this file into the BigQuery console: Scheduled queries > Create).

CREATE OR REPLACE TABLE `nivaran_air.pm25_forecast` AS
SELECT
  station_id,
  forecast_timestamp,
  forecast_value AS pm25_forecast,
  prediction_interval_lower_bound AS pm25_lower,
  prediction_interval_upper_bound AS pm25_upper,
  CURRENT_TIMESTAMP() AS generated_at
FROM
  AI.FORECAST(
    (
      SELECT station_id, ts, pm25
      FROM `nivaran_air.cpcb_station_hourly`
      WHERE ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
    ),
    data_col => 'pm25',
    timestamp_col => 'ts',
    id_cols => ['station_id'],
    horizon => 72,
    confidence_level => 0.8,
    model => 'TimesFM 2.5'
  );
