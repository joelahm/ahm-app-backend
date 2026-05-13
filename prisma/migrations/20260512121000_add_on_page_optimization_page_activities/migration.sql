CREATE TABLE `client_on_page_optimization_page_activities` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `run_id` BIGINT UNSIGNED NOT NULL,
  `page_url` VARCHAR(1000) NOT NULL,
  `kind` VARCHAR(32) NOT NULL DEFAULT 'COMMENT',
  `type` VARCHAR(64) NULL,
  `comment` TEXT NULL,
  `body_json` JSON NULL,
  `metadata_json` JSON NULL,
  `actor_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `idx_on_page_activity_run_page_created` (`run_id`, `page_url`(255), `created_at`),
  INDEX `idx_on_page_activity_actor_user_id` (`actor_user_id`),
  CONSTRAINT `fk_on_page_optimization_page_activities_run`
    FOREIGN KEY (`run_id`)
    REFERENCES `client_on_page_optimization_runs` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_on_page_optimization_page_activities_actor`
    FOREIGN KEY (`actor_user_id`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
