/*
  Warnings:

  - You are about to alter the column `quantity_done` on the `task_progress_logs` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `target_quantity` on the `tasks` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.

*/
-- DropForeignKey
ALTER TABLE `task_progress_logs` DROP FOREIGN KEY `task_progress_logs_assignment_id_fkey`;

-- DropForeignKey
ALTER TABLE `tasks` DROP FOREIGN KEY `tasks_parent_task_id_fkey`;

-- DropIndex
DROP INDEX `task_progress_logs_assignment_id_key` ON `task_progress_logs`;

-- DropIndex
DROP INDEX `tasks_parent_task_id_scheduled_date_key` ON `tasks`;

-- AlterTable
ALTER TABLE `task_progress_logs` MODIFY `quantity_done` DOUBLE NOT NULL;

-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `current_quantity` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `goal_type` ENUM('OPEN', 'FIXED') NOT NULL DEFAULT 'OPEN',
    MODIFY `target_quantity` DOUBLE NULL;

-- AddForeignKey
ALTER TABLE `task_progress_logs` ADD CONSTRAINT `task_progress_logs_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `task_assignments`(`assignment_id`) ON DELETE CASCADE ON UPDATE CASCADE;
