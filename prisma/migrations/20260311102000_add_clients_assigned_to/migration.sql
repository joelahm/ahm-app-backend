-- Add assigned user reference on clients
ALTER TABLE `clients`
  ADD COLUMN `assigned_to` BIGINT UNSIGNED NULL AFTER `conditions_treated`,
  ADD INDEX `idx_clients_assigned_to` (`assigned_to`);

ALTER TABLE `clients`
  ADD CONSTRAINT `fk_clients_assigned_to`
  FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
