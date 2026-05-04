ALTER TABLE `project_tasks`
  ADD COLUMN `blocked_task_id` BIGINT UNSIGNED NULL AFTER `parent_task_id`,
  ADD COLUMN `due_date_rule_type` VARCHAR(32) NULL AFTER `due_date`,
  ADD COLUMN `due_date_offset_days` INTEGER NOT NULL DEFAULT 0 AFTER `due_date_rule_type`,
  ADD COLUMN `due_date_manual_override` BOOLEAN NOT NULL DEFAULT false AFTER `due_date_offset_days`,
  ADD COLUMN `template_task_id` VARCHAR(128) NULL AFTER `due_date_manual_override`,
  ADD INDEX `idx_project_tasks_blocked_task_id` (`blocked_task_id`);

ALTER TABLE `project_tasks`
  ADD CONSTRAINT `fk_project_tasks_blocked_task`
  FOREIGN KEY (`blocked_task_id`) REFERENCES `project_tasks`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
