ALTER TABLE `dataforseo_google_ads_locations`
  DROP INDEX `idx_dataforseo_google_ads_locations_country_region`,
  DROP INDEX `idx_dataforseo_google_ads_locations_canonical_name`,
  DROP COLUMN `country_name`,
  DROP COLUMN `region_name`,
  DROP COLUMN `canonical_name`,
  ADD COLUMN `location_code_parent` INT UNSIGNED NULL AFTER `location_name`,
  ADD COLUMN `country_iso_code` VARCHAR(8) NULL AFTER `location_code_parent`,
  ADD INDEX `idx_dataforseo_google_ads_locations_country_parent`(`country_iso_code`, `location_code_parent`),
  ADD INDEX `idx_dataforseo_google_ads_locations_location_type`(`location_type`);
