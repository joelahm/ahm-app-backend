ALTER TABLE `clients`
  ADD COLUMN `personal_phone` VARCHAR(64) NULL AFTER `personal_email`,
  ADD COLUMN `practice_structure` VARCHAR(180) NULL AFTER `profession`,
  ADD COLUMN `gmc_registration_number` VARCHAR(120) NULL AFTER `practice_structure`,
  ADD COLUMN `credentials` TEXT NULL AFTER `unique_to_competitors`,
  ADD COLUMN `major_accomplishments` TEXT NULL AFTER `credentials`,
  ADD COLUMN `other_images` JSON NULL AFTER `practice_location_exterior_photo`,
  ADD COLUMN `building_name` VARCHAR(255) NULL AFTER `other_images`,
  ADD COLUMN `unit_number` VARCHAR(120) NULL AFTER `building_name`,
  ADD COLUMN `street_address` VARCHAR(255) NULL AFTER `unit_number`,
  ADD COLUMN `region` VARCHAR(180) NULL AFTER `street_address`,
  ADD COLUMN `nearby_areas_served` VARCHAR(500) NULL AFTER `visible_area`;
