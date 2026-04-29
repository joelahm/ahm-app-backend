CREATE TABLE `website_content_review_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `keyword_content_list_id` BIGINT UNSIGNED NOT NULL,
  `keyword_id` VARCHAR(120) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `token_ciphertext` TEXT NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `expires_at` DATETIME(3) NOT NULL,
  `disabled_at` DATETIME(3) NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uq_website_content_review_links_token_hash` (`token_hash`),
  INDEX `idx_wcr_links_client_id` (`client_id`),
  INDEX `idx_wcr_links_keyword` (`keyword_content_list_id`, `keyword_id`),
  INDEX `idx_wcr_links_expires_at` (`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_content_review_otps` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `review_link_id` BIGINT UNSIGNED NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `otp_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `attempt_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_wcr_otps_link_email` (`review_link_id`, `email`),
  INDEX `idx_wcr_otps_expires_at` (`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_content_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `keyword_content_list_id` BIGINT UNSIGNED NOT NULL,
  `keyword_id` VARCHAR(120) NOT NULL,
  `source` VARCHAR(64) NOT NULL,
  `snapshot_json` JSON NOT NULL,
  `created_by_type` VARCHAR(32) NOT NULL,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `created_by_name` VARCHAR(255) NULL,
  `created_by_email` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_wcr_versions_client_id` (`client_id`),
  INDEX `idx_wcr_versions_keyword` (`keyword_content_list_id`, `keyword_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_content_edit_activity` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `keyword_content_list_id` BIGINT UNSIGNED NOT NULL,
  `keyword_id` VARCHAR(120) NOT NULL,
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
  INDEX `idx_wcr_activity_client_id` (`client_id`),
  INDEX `idx_wcr_activity_keyword` (`keyword_content_list_id`, `keyword_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_content_review_comments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `review_link_id` BIGINT UNSIGNED NULL,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `keyword_content_list_id` BIGINT UNSIGNED NOT NULL,
  `keyword_id` VARCHAR(120) NOT NULL,
  `comment` TEXT NOT NULL,
  `author_name` VARCHAR(255) NOT NULL,
  `author_email` VARCHAR(255) NULL,
  `source` VARCHAR(32) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_wcr_comments_review_link_id` (`review_link_id`),
  INDEX `idx_wcr_comments_keyword` (`keyword_content_list_id`, `keyword_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
