-- Create client projects table
CREATE TABLE `client_projects` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `project` VARCHAR(180) NOT NULL,
  `client_success_manager_id` BIGINT UNSIGNED NULL,
  `account_manager_id` BIGINT UNSIGNED NULL,
  `phase` VARCHAR(120) NOT NULL,
  `progress` VARCHAR(120) NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_client_projects_client_id`(`client_id`),
  INDEX `idx_client_projects_client_success_manager_id`(`client_success_manager_id`),
  INDEX `idx_client_projects_account_manager_id`(`account_manager_id`),
  INDEX `idx_client_projects_created_by`(`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `client_projects`
  ADD CONSTRAINT `fk_client_projects_client`
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `client_projects`
  ADD CONSTRAINT `fk_client_projects_client_success_manager`
  FOREIGN KEY (`client_success_manager_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `client_projects`
  ADD CONSTRAINT `fk_client_projects_account_manager`
  FOREIGN KEY (`account_manager_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `client_projects`
  ADD CONSTRAINT `fk_client_projects_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
