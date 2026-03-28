UPDATE `project_tasks`
SET `status` = 'ACTIVE'
WHERE `status` = 'TODO';

ALTER TABLE `project_tasks`
  MODIFY COLUMN `status` VARCHAR(64) NOT NULL DEFAULT 'ACTIVE';
