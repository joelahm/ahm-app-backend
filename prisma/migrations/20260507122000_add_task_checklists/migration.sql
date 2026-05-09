CREATE TABLE `task_checklists` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `task_id` BIGINT UNSIGNED NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_task_checklists_task_id`(`task_id`),
    INDEX `idx_task_checklists_created_by`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `task_checklist_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `checklist_id` BIGINT UNSIGNED NOT NULL,
    `text` VARCHAR(500) NOT NULL,
    `is_complete` BOOLEAN NOT NULL DEFAULT false,
    `completed_at` DATETIME(3) NULL,
    `completed_by` BIGINT UNSIGNED NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_task_checklist_items_checklist_id`(`checklist_id`),
    INDEX `idx_task_checklist_items_completed_by`(`completed_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `task_checklists` ADD CONSTRAINT `fk_task_checklists_task` FOREIGN KEY (`task_id`) REFERENCES `project_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_checklists` ADD CONSTRAINT `fk_task_checklists_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `task_checklist_items` ADD CONSTRAINT `fk_task_checklist_items_checklist` FOREIGN KEY (`checklist_id`) REFERENCES `task_checklists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_checklist_items` ADD CONSTRAINT `fk_task_checklist_items_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
