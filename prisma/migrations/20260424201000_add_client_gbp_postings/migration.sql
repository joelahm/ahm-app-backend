CREATE TABLE `client_gbp_postings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `keyword` VARCHAR(255) NOT NULL,
  `audience` VARCHAR(255) NULL,
  `language_code` VARCHAR(16) NOT NULL DEFAULT 'en',
  `language` VARCHAR(120) NOT NULL DEFAULT 'English',
  `content_type` VARCHAR(64) NOT NULL,
  `description` TEXT NULL,
  `post_content` TEXT NULL,
  `images` JSON NULL,
  `live_link` VARCHAR(512) NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'Draft',
  `scheduled_at` DATETIME(3) NULL,
  `published_at` DATETIME(3) NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_client_gbp_postings_client_id` (`client_id`),
  INDEX `idx_client_gbp_postings_created_by` (`created_by`),
  INDEX `idx_client_gbp_postings_status` (`status`),
  INDEX `idx_client_gbp_postings_created_at` (`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `client_gbp_postings`
  ADD CONSTRAINT `fk_client_gbp_postings_client`
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `client_gbp_postings`
  ADD CONSTRAINT `fk_client_gbp_postings_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
