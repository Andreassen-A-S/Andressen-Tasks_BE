/*
  Warnings:

  - A unique constraint covering the columns `[parent_task_id,scheduled_date]` on the table `tasks` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `parent_task_id` VARCHAR(191) NULL,
    ADD COLUMN `scheduled_date` DATETIME(3) NULL,
    ADD COLUMN `target_quantity` INTEGER NULL,
    ADD COLUMN `unit` ENUM('NONE', 'HOURS', 'METERS', 'KILOMETERS', 'LITERS', 'KILOGRAMS') NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE `task_progress_logs` (
    `progress_id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `quantity_done` INTEGER NOT NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_progress_logs_task_id_idx`(`task_id`),
    INDEX `task_progress_logs_user_id_idx`(`user_id`),
    UNIQUE INDEX `task_progress_logs_task_id_user_id_key`(`task_id`, `user_id`),
    PRIMARY KEY (`progress_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `tasks_parent_task_id_idx` ON `tasks`(`parent_task_id`);

-- CreateIndex
CREATE INDEX `tasks_scheduled_date_idx` ON `tasks`(`scheduled_date`);

-- CreateIndex
CREATE UNIQUE INDEX `tasks_parent_task_id_scheduled_date_key` ON `tasks`(`parent_task_id`, `scheduled_date`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_parent_task_id_fkey` FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_progress_logs` ADD CONSTRAINT `task_progress_logs_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_progress_logs` ADD CONSTRAINT `task_progress_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;
