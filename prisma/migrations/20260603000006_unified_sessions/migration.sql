-- Unified sessions refactor: replaces browser_sessions + browser_session_accounts + refresh_tokens
-- with sessions + session_accounts + refresh_tokens (new schema).
-- Browser session data is migrated; mobile refresh tokens are dropped (force re-login).

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Create sessions table
CREATE TABLE `sessions` (
    `session_id` VARCHAR(191) NOT NULL,
    `platform` ENUM('browser', 'mobile') NOT NULL DEFAULT 'browser',
    `active_session_account_id` VARCHAR(191) NULL,
    `device_name` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`session_id`),
    UNIQUE INDEX `sessions_active_session_account_id_key`(`active_session_account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Create session_accounts table
CREATE TABLE `session_accounts` (
    `session_account_id` VARCHAR(191) NOT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    PRIMARY KEY (`session_account_id`),
    UNIQUE INDEX `session_accounts_session_id_user_id_key`(`session_id`, `user_id`),
    INDEX `session_accounts_session_id_idx`(`session_id`),
    INDEX `session_accounts_user_id_idx`(`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Migrate browser_sessions → sessions
INSERT INTO `sessions` (`session_id`, `platform`, `device_name`, `location`, `expires_at`, `revoked_at`, `created_at`, `updated_at`)
SELECT `session_id`, 'browser', `device_name`, `location`, `expires_at`, NULL, `created_at`, NOW(3)
FROM `browser_sessions`;

-- 4. Migrate browser_session_accounts → session_accounts
INSERT INTO `session_accounts` (`session_account_id`, `session_id`, `user_id`, `added_at`, `last_used_at`, `expires_at`, `revoked_at`)
SELECT `id`, `session_id`, `user_id`, `added_at`, `last_used_at`, `expires_at`, `revoked_at`
FROM `browser_session_accounts`;

-- 5. Set active_session_account_id from browser_sessions.active_user_id
UPDATE `sessions` s
INNER JOIN `browser_sessions` bs ON s.`session_id` = bs.`session_id`
INNER JOIN `session_accounts` sa ON sa.`session_id` = s.`session_id` AND sa.`user_id` = bs.`active_user_id`
SET s.`active_session_account_id` = sa.`session_account_id`
WHERE bs.`active_user_id` IS NOT NULL;

-- 6. Add FK constraints for session_accounts
ALTER TABLE `session_accounts`
    ADD CONSTRAINT `session_accounts_session_id_fkey`
    FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `session_accounts`
    ADD CONSTRAINT `session_accounts_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Add circular FK: sessions.active_session_account_id → session_accounts
ALTER TABLE `sessions`
    ADD CONSTRAINT `sessions_active_session_account_id_fkey`
    FOREIGN KEY (`active_session_account_id`) REFERENCES `session_accounts`(`session_account_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Drop old refresh_tokens and create new
DROP TABLE IF EXISTS `refresh_tokens`;

CREATE TABLE `refresh_tokens` (
    `token_id` VARCHAR(191) NOT NULL,
    `session_account_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `family_id` VARCHAR(191) NOT NULL,
    `parent_token_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    PRIMARY KEY (`token_id`),
    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_session_account_id_idx`(`session_account_id`),
    INDEX `refresh_tokens_family_id_idx`(`family_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `refresh_tokens`
    ADD CONSTRAINT `refresh_tokens_session_account_id_fkey`
    FOREIGN KEY (`session_account_id`) REFERENCES `session_accounts`(`session_account_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. Drop old tables
DROP TABLE `browser_session_accounts`;
DROP TABLE `browser_sessions`;

SET FOREIGN_KEY_CHECKS = 1;
