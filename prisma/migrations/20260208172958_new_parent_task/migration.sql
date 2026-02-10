/*
  Warnings:

  - You are about to drop the column `task_id` on the `task_progress_logs` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `task_progress_logs` table. All the data in the column will be lost.
  - Added the required column `assignment_id` to the `task_progress_logs` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `task_progress_logs` DROP FOREIGN KEY `task_progress_logs_task_id_fkey`;

-- DropForeignKey
ALTER TABLE `task_progress_logs` DROP FOREIGN KEY `task_progress_logs_user_id_fkey`;

-- DropIndex
DROP INDEX `task_progress_logs_task_id_idx` ON `task_progress_logs`;

-- DropIndex
DROP INDEX `task_progress_logs_task_id_user_id_key` ON `task_progress_logs`;

-- DropIndex
DROP INDEX `task_progress_logs_user_id_idx` ON `task_progress_logs`;

-- AlterTable
ALTER TABLE `task_progress_logs` DROP COLUMN `task_id`,
    DROP COLUMN `user_id`,
    ADD COLUMN `assignment_id` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `task_progress_logs_assignment_id_idx` ON `task_progress_logs`(`assignment_id`);

-- CreateIndex
CREATE INDEX `task_progress_logs_created_at_idx` ON `task_progress_logs`(`created_at`);

-- AddForeignKey
ALTER TABLE `task_progress_logs` ADD CONSTRAINT `task_progress_logs_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `task_assignments`(`assignment_id`) ON DELETE CASCADE ON UPDATE CASCADE;
