ALTER TABLE `task_comments`
  ADD COLUMN `body_json` JSON NULL AFTER `comment`;
