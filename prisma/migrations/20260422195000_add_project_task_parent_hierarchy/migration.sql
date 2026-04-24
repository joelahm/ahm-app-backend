ALTER TABLE `project_tasks`
  ADD COLUMN `parent_task_id` BIGINT UNSIGNED NULL;

ALTER TABLE `project_tasks`
  ADD INDEX `idx_project_tasks_parent_task_id`(`parent_task_id`);

ALTER TABLE `project_tasks`
  ADD CONSTRAINT `fk_project_tasks_parent_task`
  FOREIGN KEY (`parent_task_id`) REFERENCES `project_tasks`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
