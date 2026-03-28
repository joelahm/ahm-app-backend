ALTER TABLE `scans`
  ADD COLUMN `remaining_runs` INT UNSIGNED NULL AFTER `repeat_time`;

UPDATE `scans`
SET `remaining_runs` = CASE
  WHEN `recurrence_enabled` = 1 AND `repeat_time` IS NOT NULL THEN `repeat_time`
  ELSE NULL
END;
