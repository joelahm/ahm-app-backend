ALTER TABLE `client_citations`
  ADD COLUMN `verification_status` JSON NULL AFTER `notes`;
