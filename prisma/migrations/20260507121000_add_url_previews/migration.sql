CREATE TABLE `url_previews` (
    `urlHash` VARCHAR(64) NOT NULL,
    `url` TEXT NOT NULL,
    `title` VARCHAR(500) NULL,
    `description` TEXT NULL,
    `image` VARCHAR(1000) NULL,
    `site_name` VARCHAR(255) NULL,
    `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`urlHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
