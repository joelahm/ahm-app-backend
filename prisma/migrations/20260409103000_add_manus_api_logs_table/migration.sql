CREATE TABLE `manus_api_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `operation` VARCHAR(128) NOT NULL,
  `client_id` BIGINT UNSIGNED NULL,
  `requested_by` BIGINT UNSIGNED NULL,
  `endpoint` VARCHAR(255) NOT NULL,
  `request_method` VARCHAR(16) NOT NULL,
  `request_payload` JSON NOT NULL,
  `response_status_code` INT NULL,
  `response_payload` JSON NULL,
  `is_success` BOOLEAN NOT NULL DEFAULT false,
  `external_task_id` VARCHAR(128) NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_manus_api_logs_operation`(`operation`),
  INDEX `idx_manus_api_logs_client_id`(`client_id`),
  INDEX `idx_manus_api_logs_requested_by`(`requested_by`),
  INDEX `idx_manus_api_logs_created_at`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `manus_api_logs`
  ADD CONSTRAINT `fk_manus_api_logs_client`
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE `manus_api_logs`
  ADD CONSTRAINT `fk_manus_api_logs_requested_by`
  FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
