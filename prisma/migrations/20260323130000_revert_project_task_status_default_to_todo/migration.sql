UPDATE `project_tasks`
SET `status` = 'TODO'
WHERE `status` = 'ACTIVE';

ALTER TABLE `project_tasks`
  MODIFY COLUMN `status` VARCHAR(64) NOT NULL DEFAULT 'TODO';
