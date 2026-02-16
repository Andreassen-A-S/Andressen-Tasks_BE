-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `completed_by` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `tasks_completed_by_idx` ON `tasks`(`completed_by`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_completed_by_fkey` FOREIGN KEY (`completed_by`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;
