-- AlterTable
ALTER TABLE `task_attachments` MODIFY `status` ENUM('PENDING', 'CONFIRMED') NOT NULL DEFAULT 'PENDING';
