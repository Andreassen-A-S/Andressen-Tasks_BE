/*
  Warnings:

  - You are about to drop the column `recurrence_rule` on the `recurring_task_templates` table. All the data in the column will be lost.
  - Added the required column `frequency` to the `recurring_task_templates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `recurring_task_templates` DROP COLUMN `recurrence_rule`,
    ADD COLUMN `day_of_month` INTEGER NULL,
    ADD COLUMN `days_of_week` JSON NULL,
    ADD COLUMN `frequency` ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY') NOT NULL,
    ADD COLUMN `interval` INTEGER NOT NULL DEFAULT 1;
