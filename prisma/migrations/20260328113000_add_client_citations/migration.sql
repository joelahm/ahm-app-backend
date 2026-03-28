CREATE TABLE `client_citations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `directory_name` VARCHAR(180) NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'NOT_SYNCED',
  `profile_url` VARCHAR(500) NULL,
  `username` VARCHAR(255) NULL,
  `password` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `uq_client_citations_client_directory`(`client_id`, `directory_name`),
  INDEX `idx_client_citations_client_id`(`client_id`),
  INDEX `idx_client_citations_status`(`status`),
  INDEX `idx_client_citations_created_by`(`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `client_citations`
  ADD CONSTRAINT `fk_client_citations_client`
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `client_citations`
  ADD CONSTRAINT `fk_client_citations_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
