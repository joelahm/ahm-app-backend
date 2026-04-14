CREATE TABLE `keyword_content_lists` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `location` VARCHAR(120) NOT NULL,
  `enable_content_clustering` BOOLEAN NOT NULL DEFAULT false,
  `topic` VARCHAR(255) NULL,
  `audience` VARCHAR(255) NULL,
  `keywords_json` JSON NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_keyword_content_lists_client_id`(`client_id`),
  INDEX `idx_keyword_content_lists_created_by`(`created_by`),
  INDEX `idx_keyword_content_lists_created_at`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `keyword_content_lists`
  ADD CONSTRAINT `fk_keyword_content_lists_client`
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE `keyword_content_lists`
  ADD CONSTRAINT `fk_keyword_content_lists_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
