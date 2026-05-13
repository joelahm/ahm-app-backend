CREATE TABLE `client_on_page_optimization_runs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `website_url` VARCHAR(500) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
  `health_score` INTEGER NULL,
  `health_grade` VARCHAR(16) NULL,
  `health_status` VARCHAR(64) NULL,
  `pages_audited` INTEGER NULL,
  `high_issues` INTEGER NULL,
  `medium_issues` INTEGER NULL,
  `low_issues` INTEGER NULL,
  `markdown_path` VARCHAR(1000) NULL,
  `pdf_path` VARCHAR(1000) NULL,
  `pdf_link` VARCHAR(1000) NULL,
  `drive_link` VARCHAR(1000) NULL,
  `summary_json` JSON NULL,
  `result_json` JSON NULL,
  `raw_output` LONGTEXT NULL,
  `failure_message` TEXT NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `idx_on_page_optimization_runs_client_created` (`client_id`, `created_at`),
  INDEX `idx_on_page_optimization_runs_status` (`status`),
  INDEX `idx_on_page_optimization_runs_created_by` (`created_by`),
  CONSTRAINT `fk_on_page_optimization_runs_client`
    FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_on_page_optimization_runs_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
