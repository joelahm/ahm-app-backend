RENAME TABLE `scan_results` TO `scan_results_old`, `scan_runs` TO `scan_runs_old`, `scans` TO `scans_old`;

CREATE TABLE `scans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `gbp_profile_id` BIGINT UNSIGNED NOT NULL,
  `keyword` VARCHAR(255) NOT NULL,
  `coverage_unit` VARCHAR(32) NOT NULL,
  `coverage_points` JSON NOT NULL,
  `labels` JSON NULL,
  `frequency` VARCHAR(32) NOT NULL,
  `repeat_time` VARCHAR(16) NOT NULL,
  `start_at` DATETIME(3) NOT NULL,
  `next_run_at` DATETIME(3) NOT NULL,
  `estimated_requests` INT UNSIGNED NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_scans_client_id`(`client_id`),
  INDEX `idx_scans_gbp_profile_id`(`gbp_profile_id`),
  INDEX `idx_scans_keyword`(`keyword`),
  INDEX `idx_scans_status`(`status`),
  INDEX `idx_scans_next_run_at`(`next_run_at`),
  INDEX `idx_scans_created_by`(`created_by`),
  CONSTRAINT `fk_scans_client_v2` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_scans_gbp_profile_v2` FOREIGN KEY (`gbp_profile_id`) REFERENCES `client_gbp_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_scans_created_by_v2` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `scan_runs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scan_id` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `total_requests` INT UNSIGNED NOT NULL,
  `completed_requests` INT UNSIGNED NOT NULL DEFAULT 0,
  `failed_requests` INT UNSIGNED NOT NULL DEFAULT 0,
  `triggered_by` BIGINT UNSIGNED NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  `summary` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_scan_runs_scan_id`(`scan_id`),
  INDEX `idx_scan_runs_status`(`status`),
  INDEX `idx_scan_runs_triggered_by`(`triggered_by`),
  INDEX `idx_scan_runs_started_at`(`started_at`),
  CONSTRAINT `fk_scan_runs_scan_v2` FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_scan_runs_triggered_by_v2` FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `scan_results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scan_run_id` BIGINT UNSIGNED NOT NULL,
  `keyword` VARCHAR(255) NOT NULL,
  `coordinate_label` VARCHAR(180) NULL,
  `latitude` DECIMAL(10,7) NOT NULL,
  `longitude` DECIMAL(10,7) NOT NULL,
  `rank_absolute` INT NULL,
  `rank_group` INT NULL,
  `matched_title` VARCHAR(255) NULL,
  `matched_domain` VARCHAR(255) NULL,
  `matched_place_id` VARCHAR(255) NULL,
  `matched_address` VARCHAR(255) NULL,
  `matched_phone` VARCHAR(64) NULL,
  `matched_rating` DECIMAL(3,2) NULL,
  `matched_item` JSON NULL,
  `api_log_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_scan_results_scan_run_id`(`scan_run_id`),
  INDEX `idx_scan_results_keyword`(`keyword`),
  INDEX `idx_scan_results_matched_place_id`(`matched_place_id`),
  INDEX `idx_scan_results_api_log_id`(`api_log_id`),
  CONSTRAINT `fk_scan_results_scan_run_v2` FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TEMPORARY TABLE `scan_keyword_expanded` AS
SELECT
  s.id AS old_scan_id,
  jt.keyword AS keyword,
  s.client_id,
  s.gbp_profile_id,
  s.coverage_unit,
  s.coverage_points,
  s.labels,
  s.frequency,
  s.repeat_time,
  s.start_at,
  s.next_run_at,
  JSON_LENGTH(s.coverage_points) AS estimated_requests,
  s.status,
  s.created_by,
  s.created_at,
  s.updated_at
FROM `scans_old` s
JOIN JSON_TABLE(s.keywords, '$[*]' COLUMNS (keyword VARCHAR(255) PATH '$')) jt;

INSERT INTO `scans` (
  client_id,
  gbp_profile_id,
  keyword,
  coverage_unit,
  coverage_points,
  labels,
  frequency,
  repeat_time,
  start_at,
  next_run_at,
  estimated_requests,
  status,
  created_by,
  created_at,
  updated_at
)
SELECT
  client_id,
  gbp_profile_id,
  keyword,
  coverage_unit,
  coverage_points,
  labels,
  frequency,
  repeat_time,
  start_at,
  next_run_at,
  estimated_requests,
  status,
  created_by,
  created_at,
  updated_at
FROM `scan_keyword_expanded`;

CREATE TEMPORARY TABLE `scan_keyword_map` AS
SELECT
  ske.old_scan_id,
  ske.keyword,
  s.id AS new_scan_id
FROM `scan_keyword_expanded` ske
JOIN `scans` s
  ON s.client_id = ske.client_id
  AND s.gbp_profile_id = ske.gbp_profile_id
  AND s.keyword = (ske.keyword COLLATE utf8mb4_unicode_ci)
  AND s.created_at = ske.created_at
  AND s.updated_at = ske.updated_at;

CREATE TEMPORARY TABLE `scan_run_source` AS
SELECT
  sr.id AS old_run_id,
  skm.new_scan_id,
  sr.status,
  JSON_LENGTH(s.coverage_points) AS total_requests,
  sr.completed_requests,
  sr.failed_requests,
  sr.triggered_by,
  sr.started_at,
  sr.finished_at,
  sr.summary,
  sr.created_at,
  sr.updated_at
FROM `scan_runs_old` sr
JOIN `scan_keyword_map` skm ON skm.old_scan_id = sr.scan_id
JOIN `scans` s ON s.id = skm.new_scan_id;

INSERT INTO `scan_runs` (
  scan_id,
  status,
  total_requests,
  completed_requests,
  failed_requests,
  triggered_by,
  started_at,
  finished_at,
  summary,
  created_at,
  updated_at
)
SELECT
  new_scan_id,
  status,
  total_requests,
  completed_requests,
  failed_requests,
  triggered_by,
  started_at,
  finished_at,
  summary,
  created_at,
  updated_at
FROM `scan_run_source`;

CREATE TEMPORARY TABLE `scan_run_map` AS
SELECT
  srs.old_run_id,
  srs.new_scan_id,
  sr.id AS new_run_id
FROM `scan_run_source` srs
JOIN `scan_runs` sr
  ON sr.scan_id = srs.new_scan_id
  AND sr.started_at = srs.started_at
  AND sr.created_at = srs.created_at;

INSERT INTO `scan_results` (
  scan_run_id,
  keyword,
  coordinate_label,
  latitude,
  longitude,
  rank_absolute,
  rank_group,
  matched_title,
  matched_domain,
  matched_place_id,
  matched_address,
  matched_phone,
  matched_rating,
  matched_item,
  api_log_id,
  created_at
)
SELECT
  srm.new_run_id,
  sr.keyword,
  sr.coordinate_label,
  sr.latitude,
  sr.longitude,
  sr.rank_absolute,
  sr.rank_group,
  sr.matched_title,
  sr.matched_domain,
  sr.matched_place_id,
  sr.matched_address,
  sr.matched_phone,
  sr.matched_rating,
  sr.matched_item,
  sr.api_log_id,
  sr.created_at
FROM `scan_results_old` sr
JOIN `scan_runs_old` sro ON sro.id = sr.scan_run_id
JOIN `scan_run_map` srm ON srm.old_run_id = sro.id
JOIN `scans` s ON s.id = srm.new_scan_id
WHERE (sr.keyword COLLATE utf8mb4_unicode_ci) = s.keyword;

DROP TABLE `scan_results_old`;
DROP TABLE `scan_runs_old`;
DROP TABLE `scans_old`;
