ALTER TABLE `citation_database_entries`
  ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'Published' AFTER `payment`;

CREATE INDEX `idx_citation_database_entries_status`
  ON `citation_database_entries`(`status`);
