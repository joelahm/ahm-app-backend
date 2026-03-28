CREATE TABLE `client_gbp_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(64) NOT NULL DEFAULT 'SERPAPI',
  `place_id` VARCHAR(255) NOT NULL,
  `data_cid` VARCHAR(255) NULL,
  `title` VARCHAR(255) NULL,
  `address` VARCHAR(255) NULL,
  `phone` VARCHAR(64) NULL,
  `website` VARCHAR(255) NULL,
  `rating` DECIMAL(3,2) NULL,
  `reviews_count` INT UNSIGNED NULL,
  `business_type` VARCHAR(180) NULL,
  `gps_coordinates` JSON NULL,
  `hours` JSON NULL,
  `raw_snapshot` JSON NULL,
  `last_synced_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uq_client_gbp_profiles_client_id`(`client_id`),
  INDEX `idx_client_gbp_profiles_place_id`(`place_id`),
  INDEX `idx_client_gbp_profiles_data_cid`(`data_cid`),
  INDEX `idx_client_gbp_profiles_last_synced_at`(`last_synced_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_client_gbp_profiles_client`
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
