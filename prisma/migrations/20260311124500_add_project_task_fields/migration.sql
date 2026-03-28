-- Add payload-compatible task fields
ALTER TABLE `project_tasks`
  ADD COLUMN `project_type` VARCHAR(120) NULL AFTER `task`,
  ADD COLUMN `start_date` DATETIME(3) NULL AFTER `priority`;
