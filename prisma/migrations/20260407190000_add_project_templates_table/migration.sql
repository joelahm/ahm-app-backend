CREATE TABLE `project_templates` (
  `id` VARCHAR(64) NOT NULL,
  `project_name` VARCHAR(180) NOT NULL,
  `description` LONGTEXT NOT NULL,
  `status` VARCHAR(64) NOT NULL,
  `tasks` JSON NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `idx_project_templates_updated_at`(`updated_at`),
  INDEX `idx_project_templates_created_by`(`created_by`),
  CONSTRAINT `fk_project_templates_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
