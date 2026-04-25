ALTER TABLE `scans`
  ADD COLUMN `timezone` VARCHAR(64) NULL AFTER `next_run_at`,
  ADD COLUMN `notes` TEXT NULL AFTER `timezone`;
