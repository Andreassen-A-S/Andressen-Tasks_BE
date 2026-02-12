-- AlterTable
ALTER TABLE `task_progress_logs` ADD COLUMN `unit` ENUM('NONE', 'HOURS', 'METERS', 'KILOMETERS', 'LITERS', 'KILOGRAMS') NULL;
