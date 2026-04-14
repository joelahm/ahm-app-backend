INSERT INTO `roles` (`code`, `description`)
VALUES ('GUEST', 'Guest role with limited permissions')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
