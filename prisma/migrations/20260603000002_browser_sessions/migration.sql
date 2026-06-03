CREATE TABLE `browser_sessions` (
    `session_id` VARCHAR(191) NOT NULL,
    `active_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `browser_session_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `refresh_token_hash` VARCHAR(191) NOT NULL,
    `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `last_used_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `browser_session_accounts_refresh_token_hash_key`(`refresh_token_hash`),
    UNIQUE INDEX `browser_session_accounts_session_id_user_id_key`(`session_id`, `user_id`),
    INDEX `browser_session_accounts_session_id_idx`(`session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `browser_session_accounts` ADD CONSTRAINT `browser_session_accounts_session_id_fkey`
    FOREIGN KEY (`session_id`) REFERENCES `browser_sessions`(`session_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `browser_session_accounts` ADD CONSTRAINT `browser_session_accounts_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;
