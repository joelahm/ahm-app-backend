CREATE TABLE `dataforseo_google_ads_locations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `location_code` INT UNSIGNED NOT NULL,
  `location_name` VARCHAR(255) NOT NULL,
  `country_name` VARCHAR(120) NULL,
  `region_name` VARCHAR(120) NULL,
  `location_type` VARCHAR(64) NULL,
  `canonical_name` VARCHAR(255) NOT NULL,
  `raw_data` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_dataforseo_google_ads_locations_location_code`(`location_code`),
  INDEX `idx_dataforseo_google_ads_locations_country_region`(`country_name`, `region_name`),
  INDEX `idx_dataforseo_google_ads_locations_canonical_name`(`canonical_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
