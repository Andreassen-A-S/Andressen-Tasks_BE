-- CreateTable (must come first so FK references resolve)
CREATE TABLE `organizations` (
    `org_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `logo_url` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organizations_slug_key`(`slug`),
    PRIMARY KEY (`org_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: add as nullable first so existing rows don't violate NOT NULL
ALTER TABLE `projects` ADD COLUMN `organization_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `organization_id` VARCHAR(191) NULL,
    MODIFY `role` ENUM('USER', 'ADMIN', 'SYSTEM', 'SUPER_ADMIN') NOT NULL DEFAULT 'USER';

-- Seed default organization for existing data
INSERT INTO `organizations` (`org_id`, `name`, `slug`, `updated_at`)
VALUES ('00000000-0000-0000-0000-000000000001', 'Andreassen', 'andreassen', NOW());

-- Backfill: assign all existing projects to the default org
UPDATE `projects` SET `organization_id` = '00000000-0000-0000-0000-000000000001';

-- Backfill: assign all existing non-system users to the default org
UPDATE `users` SET `organization_id` = '00000000-0000-0000-0000-000000000001'
WHERE `role` NOT IN ('SYSTEM', 'SUPER_ADMIN');

-- Now enforce NOT NULL on projects (all rows are populated)
ALTER TABLE `projects` MODIFY `organization_id` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `projects_organization_id_idx` ON `projects`(`organization_id`);

-- CreateIndex
CREATE INDEX `users_organization_id_idx` ON `users`(`organization_id`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`org_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`org_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
