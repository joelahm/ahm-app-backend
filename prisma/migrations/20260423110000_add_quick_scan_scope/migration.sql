ALTER TABLE `scans`
  ADD COLUMN `scan_scope` VARCHAR(32) NOT NULL DEFAULT 'CLIENT' AFTER `gbp_profile_id`,
  ADD COLUMN `source_page` VARCHAR(64) NULL AFTER `scan_scope`,
  ADD COLUMN `quick_scan_context` JSON NULL AFTER `source_page`,
  MODIFY COLUMN `client_id` BIGINT UNSIGNED NULL,
  MODIFY COLUMN `gbp_profile_id` BIGINT UNSIGNED NULL;

CREATE INDEX `idx_scans_scan_scope` ON `scans`(`scan_scope`);
CREATE INDEX `idx_scans_source_page` ON `scans`(`source_page`);
