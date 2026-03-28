ALTER TABLE `clients`
  ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' AFTER `conditions_treated`;

CREATE INDEX `idx_clients_status` ON `clients`(`status`);
