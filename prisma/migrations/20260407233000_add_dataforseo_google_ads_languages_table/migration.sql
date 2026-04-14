CREATE TABLE `dataforseo_google_ads_languages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `language_code` VARCHAR(16) NOT NULL,
  `language_name` VARCHAR(120) NOT NULL,
  `raw_data` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_dataforseo_google_ads_languages_language_code`(`language_code`),
  INDEX `idx_dataforseo_google_ads_languages_language_name`(`language_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
