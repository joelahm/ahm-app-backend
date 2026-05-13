CREATE TABLE `client_gbp_posting_review_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `posting_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `token_ciphertext` TEXT NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `expires_at` DATETIME(3) NOT NULL,
  `disabled_at` DATETIME(3) NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uq_client_gbp_posting_review_links_token_hash` (`token_hash`),
  INDEX `idx_gbp_posting_review_links_client_id` (`client_id`),
  INDEX `idx_gbp_posting_review_links_posting_id` (`posting_id`),
  INDEX `idx_gbp_posting_review_links_expires_at` (`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `client_gbp_posting_review_otps` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `review_link_id` BIGINT UNSIGNED NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `otp_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `attempt_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_gbp_posting_review_otps_link_email` (`review_link_id`, `email`),
  INDEX `idx_gbp_posting_review_otps_expires_at` (`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `client_gbp_posting_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `posting_id` BIGINT UNSIGNED NOT NULL,
  `source` VARCHAR(64) NOT NULL,
  `snapshot_json` JSON NOT NULL,
  `created_by_type` VARCHAR(32) NOT NULL,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `created_by_name` VARCHAR(255) NULL,
  `created_by_email` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_gbp_posting_versions_client_id` (`client_id`),
  INDEX `idx_gbp_posting_versions_posting` (`posting_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `client_gbp_posting_edit_activity` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `posting_id` BIGINT UNSIGNED NOT NULL,
  `actor_type` VARCHAR(32) NOT NULL,
  `actor_user_id` BIGINT UNSIGNED NULL,
  `actor_name` VARCHAR(255) NULL,
  `actor_email` VARCHAR(255) NULL,
  `action` VARCHAR(64) NOT NULL,
  `field_name` VARCHAR(120) NULL,
  `old_value` MEDIUMTEXT NULL,
  `new_value` MEDIUMTEXT NULL,
  `metadata_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_gbp_posting_activity_client_id` (`client_id`),
  INDEX `idx_gbp_posting_activity_posting` (`posting_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `client_gbp_posting_comments`
  ADD COLUMN `review_link_id` BIGINT UNSIGNED NULL AFTER `posting_id`,
  ADD COLUMN `author_name` VARCHAR(255) NULL AFTER `comment`,
  ADD COLUMN `author_email` VARCHAR(255) NULL AFTER `author_name`,
  ADD COLUMN `source` VARCHAR(32) NOT NULL DEFAULT 'INTERNAL' AFTER `author_email`,
  ADD INDEX `idx_client_gbp_posting_comments_review_link_id` (`review_link_id`);
