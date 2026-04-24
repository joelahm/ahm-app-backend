CREATE TABLE `client_review_reply_drafts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `review_id` VARCHAR(255) NOT NULL,
  `reviewer_name` VARCHAR(255) NULL,
  `rating` TINYINT UNSIGNED NULL,
  `review_text` TEXT NULL,
  `reply_text` TEXT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  `created_by` BIGINT UNSIGNED NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `uq_client_review_reply_drafts_client_review` (`client_id`, `review_id`),
  INDEX `idx_client_review_reply_drafts_client_id` (`client_id`),
  INDEX `idx_client_review_reply_drafts_created_by` (`created_by`),
  INDEX `idx_client_review_reply_drafts_updated_by` (`updated_by`),
  INDEX `idx_client_review_reply_drafts_status` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `client_review_reply_drafts`
  ADD CONSTRAINT `fk_client_review_reply_drafts_client`
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `client_review_reply_drafts`
  ADD CONSTRAINT `fk_client_review_reply_drafts_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `client_review_reply_drafts`
  ADD CONSTRAINT `fk_client_review_reply_drafts_updated_by`
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
