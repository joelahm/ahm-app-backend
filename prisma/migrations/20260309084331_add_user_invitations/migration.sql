-- CreateTable
CREATE TABLE `user_invitations` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `role_code` VARCHAR(32) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `invited_by` BIGINT UNSIGNED NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    `expires_at` DATETIME(3) NOT NULL,
    `sent_at` DATETIME(3) NULL,
    `accepted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_user_invitation_token_hash`(`token_hash`),
    INDEX `idx_user_invitation_email`(`email`),
    INDEX `idx_user_invitation_status`(`status`),
    INDEX `idx_user_invitation_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_invitations` ADD CONSTRAINT `fk_user_invitation_role` FOREIGN KEY (`role_code`) REFERENCES `roles`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_invitations` ADD CONSTRAINT `fk_user_invitation_invited_by` FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
