ALTER TABLE `client_citations`
  ADD COLUMN `citation_database_entry_id` VARCHAR(64) NULL AFTER `client_id`;

CREATE INDEX `idx_client_citations_citation_database_entry_id`
  ON `client_citations`(`citation_database_entry_id`);

ALTER TABLE `client_citations`
  ADD CONSTRAINT `fk_client_citations_citation_database_entry`
  FOREIGN KEY (`citation_database_entry_id`)
  REFERENCES `citation_database_entries`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
