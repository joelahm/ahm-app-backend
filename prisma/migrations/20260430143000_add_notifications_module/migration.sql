CREATE TABLE `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `recipient_user_id` BIGINT UNSIGNED NOT NULL,
  `actor_user_id` BIGINT UNSIGNED NULL,
  `type` VARCHAR(96) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `body` TEXT NOT NULL,
  `category` VARCHAR(32) NOT NULL DEFAULT 'OTHER',
  `severity` VARCHAR(32) NOT NULL DEFAULT 'INFO',
  `entity_type` VARCHAR(64) NULL,
  `entity_id` VARCHAR(64) NULL,
  `data_json` JSON NULL,
  `read_at` DATETIME(3) NULL,
  `cleared_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `idx_notifications_recipient_state` (`recipient_user_id`, `cleared_at`, `read_at`, `created_at`),
  INDEX `idx_notifications_type_created` (`type`, `created_at`),
  INDEX `idx_notifications_entity` (`entity_type`, `entity_id`),
  CONSTRAINT `fk_notifications_recipient`
    FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_actor`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notification_deliveries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `notification_id` BIGINT UNSIGNED NOT NULL,
  `channel` VARCHAR(32) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `target` VARCHAR(255) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `last_error` TEXT NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `idx_notification_deliveries_notification` (`notification_id`),
  INDEX `idx_notification_deliveries_channel_status` (`channel`, `status`, `created_at`),
  CONSTRAINT `fk_notification_deliveries_notification`
    FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
