ALTER TABLE `client_projects`
  ADD COLUMN `description` LONGTEXT NULL AFTER `progress`,
  ADD COLUMN `description_json` JSON NULL AFTER `description`;
