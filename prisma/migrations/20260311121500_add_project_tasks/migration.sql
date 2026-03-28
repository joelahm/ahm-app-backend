-- Create project tasks table
CREATE TABLE `project_tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT UNSIGNED NOT NULL,
  `task` VARCHAR(180) NOT NULL,
  `description` TEXT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'TODO',
  `priority` VARCHAR(64) NOT NULL DEFAULT 'MEDIUM',
  `due_date` DATETIME(3) NULL,
  `assigned_to` BIGINT UNSIGNED NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_project_tasks_project_id`(`project_id`),
  INDEX `idx_project_tasks_assigned_to`(`assigned_to`),
  INDEX `idx_project_tasks_created_by`(`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_tasks`
  ADD CONSTRAINT `fk_project_tasks_project`
  FOREIGN KEY (`project_id`) REFERENCES `client_projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_tasks`
  ADD CONSTRAINT `fk_project_tasks_assigned_to`
  FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `project_tasks`
  ADD CONSTRAINT `fk_project_tasks_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
