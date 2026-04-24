ALTER TABLE `client_gbp_postings`
  ADD COLUMN `button_type` VARCHAR(64) NULL,
  ADD COLUMN `assignee_id` BIGINT UNSIGNED NULL;

CREATE INDEX `idx_client_gbp_postings_assignee_id` ON `client_gbp_postings`(`assignee_id`);

ALTER TABLE `client_gbp_postings`
  ADD CONSTRAINT `fk_client_gbp_postings_assignee`
  FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `client_gbp_posting_comments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `posting_id` BIGINT UNSIGNED NOT NULL,
  `comment` TEXT NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_client_gbp_posting_comments_posting_id` (`posting_id`),
  INDEX `idx_client_gbp_posting_comments_created_by` (`created_by`),
  INDEX `idx_client_gbp_posting_comments_created_at` (`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `client_gbp_posting_comments`
  ADD CONSTRAINT `fk_client_gbp_posting_comments_posting`
  FOREIGN KEY (`posting_id`) REFERENCES `client_gbp_postings`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `client_gbp_posting_comments`
  ADD CONSTRAINT `fk_client_gbp_posting_comments_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
