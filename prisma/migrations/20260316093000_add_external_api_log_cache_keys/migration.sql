ALTER TABLE `external_api_logs`
  ADD COLUMN `cache_namespace` VARCHAR(128) NOT NULL DEFAULT 'LEGACY' AFTER `operation`,
  ADD COLUMN `request_hash` CHAR(64) NOT NULL DEFAULT 'LEGACY' AFTER `cache_namespace`,
  ADD INDEX `idx_external_api_logs_cache_lookup` (`cache_namespace`, `request_hash`, `created_at`);
