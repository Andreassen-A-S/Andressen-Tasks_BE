-- CreateTable
CREATE TABLE `projects` (
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `color` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `projects_created_by_idx`(`created_by`),
    PRIMARY KEY (`project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default project
INSERT INTO `projects` (`project_id`, `name`, `color`, `created_by`, `created_at`, `updated_at`)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Andreassen-A-S',
    '#1B1D22',
    '8d3c113e-9e71-4cf9-b30e-e99885eecad3',
    NOW(3),
    NOW(3)
);

-- AlterTable: add project_id with a temporary default so existing rows are populated
ALTER TABLE `tasks` ADD COLUMN `project_id` VARCHAR(191) NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001';

-- Remove the default (project_id is a required relation, not a DB default)
ALTER TABLE `tasks` ALTER COLUMN `project_id` DROP DEFAULT;

-- CreateIndex
CREATE INDEX `tasks_project_id_idx` ON `tasks`(`project_id`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
