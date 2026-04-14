-- Create project comments table
CREATE TABLE `project_comments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT UNSIGNED NOT NULL,
  `comment` TEXT NOT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_project_comments_project_id`(`project_id`),
  INDEX `idx_project_comments_created_by`(`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_comments`
  ADD CONSTRAINT `fk_project_comments_project`
  FOREIGN KEY (`project_id`) REFERENCES `client_projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_comments`
  ADD CONSTRAINT `fk_project_comments_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
