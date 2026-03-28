-- Create task comments table
CREATE TABLE `task_comments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT UNSIGNED NOT NULL,
  `comment` TEXT NOT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_task_comments_task_id`(`task_id`),
  INDEX `idx_task_comments_created_by`(`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `task_comments`
  ADD CONSTRAINT `fk_task_comments_task`
  FOREIGN KEY (`task_id`) REFERENCES `project_tasks`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_comments`
  ADD CONSTRAINT `fk_task_comments_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
