/*
  Warnings:

  - Made the column `organization_id` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `recurring_task_templates` DROP FOREIGN KEY `recurring_task_templates_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `tasks` DROP FOREIGN KEY `tasks_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `users_organization_id_fkey`;

-- Backfill SYSTEM user to MesterPlan org before making column NOT NULL
UPDATE `users` SET `organization_id` = '00000000-0000-0000-0000-000000000002' WHERE `organization_id` IS NULL;

-- AlterTable
ALTER TABLE `users` MODIFY `organization_id` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`org_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_task_templates` ADD CONSTRAINT `recurring_task_templates_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE CASCADE ON UPDATE CASCADE;
