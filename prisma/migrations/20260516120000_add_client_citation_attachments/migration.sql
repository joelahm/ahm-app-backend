CREATE TABLE `client_citation_attachments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `citation_id` BIGINT UNSIGNED NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(120) NOT NULL,
  `size_bytes` INTEGER NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `uploaded_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX `idx_client_citation_attachments_citation_id`(`citation_id`),
  INDEX `idx_client_citation_attachments_uploaded_by`(`uploaded_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `client_citation_attachments`
  ADD CONSTRAINT `fk_client_citation_attachments_citation`
  FOREIGN KEY (`citation_id`) REFERENCES `client_citations`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `client_citation_attachments`
  ADD CONSTRAINT `fk_client_citation_attachments_uploaded_by`
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
