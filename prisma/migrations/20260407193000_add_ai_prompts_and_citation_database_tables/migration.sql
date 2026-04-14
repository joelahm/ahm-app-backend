CREATE TABLE `ai_prompts` (
  `id` VARCHAR(64) NOT NULL,
  `unique_id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `purpose` TEXT NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `type_of_post` VARCHAR(255) NOT NULL,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `custom_values` JSON NOT NULL,
  `max_character` VARCHAR(64) NOT NULL,
  `prompt` LONGTEXT NOT NULL,
  `attachments` JSON NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_ai_prompts_unique_id`(`unique_id`),
  INDEX `idx_ai_prompts_client_id`(`client_id`),
  INDEX `idx_ai_prompts_created_by`(`created_by`),
  INDEX `idx_ai_prompts_updated_at`(`updated_at`),
  CONSTRAINT `fk_ai_prompts_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ai_prompts_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `citation_database_entries` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `niche` VARCHAR(180) NOT NULL,
  `validation_link` VARCHAR(500) NOT NULL,
  `da` INT NOT NULL,
  `payment` VARCHAR(32) NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `idx_citation_database_entries_created_by`(`created_by`),
  INDEX `idx_citation_database_entries_updated_at`(`updated_at`),
  CONSTRAINT `fk_citation_database_entries_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
