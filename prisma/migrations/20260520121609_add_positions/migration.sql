/*
  Warnings:

  - You are about to drop the column `position` on the `users` table. All the data in the column will be lost.

*/

-- CreateTable first so we can seed it before touching users
CREATE TABLE `positions` (
    `position_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `positions_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`position_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `positions` ADD CONSTRAINT `positions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`org_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: one Position per unique (name, org) from existing user position strings
INSERT INTO `positions` (`position_id`, `name`, `organization_id`, `updated_at`)
SELECT UUID(), `position`, `organization_id`, NOW()
FROM `users`
WHERE `position` IS NOT NULL AND `position` != ''
GROUP BY `position`, `organization_id`;

-- AlterTable: add position_id while keeping position column intact for backfill
ALTER TABLE `users` ADD COLUMN `position_id` VARCHAR(191) NULL;

-- Backfill: point each user at the Position record that matches their old string
UPDATE `users` u
INNER JOIN `positions` p ON p.`name` = u.`position` AND p.`organization_id` = u.`organization_id`
SET u.`position_id` = p.`position_id`;

-- Drop the old free-text column now that position_id is populated
ALTER TABLE `users` DROP COLUMN `position`;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `positions`(`position_id`) ON DELETE SET NULL ON UPDATE CASCADE;
