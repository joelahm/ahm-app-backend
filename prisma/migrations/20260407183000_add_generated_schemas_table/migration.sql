CREATE TABLE `generated_schemas` (
  `id` VARCHAR(64) NOT NULL,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `schema_type` VARCHAR(64) NOT NULL,
  `client_name` VARCHAR(180) NOT NULL,
  `preview_json` LONGTEXT NOT NULL,
  `business_hours` JSON NOT NULL,
  `form_values` JSON NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_generated_schemas_client_schema_type`(`client_id`, `schema_type`),
  INDEX `idx_generated_schemas_updated_at`(`updated_at`),
  INDEX `idx_generated_schemas_created_by`(`created_by`),
  CONSTRAINT `fk_generated_schemas_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_generated_schemas_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
