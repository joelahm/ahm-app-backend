-- Create clients table
CREATE TABLE `clients` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_name` VARCHAR(180) NOT NULL,
  `business_name` VARCHAR(180) NOT NULL,
  `niche` VARCHAR(255) NOT NULL,
  `personal_email` VARCHAR(255) NOT NULL,
  `practice_email` VARCHAR(255) NOT NULL,
  `business_phone` VARCHAR(64) NOT NULL,
  `website` VARCHAR(255) NULL,
  `country` VARCHAR(120) NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_clients_business_name`(`business_name`),
  INDEX `idx_clients_practice_email`(`practice_email`),
  INDEX `idx_clients_created_by`(`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `clients`
  ADD CONSTRAINT `fk_clients_created_by`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
