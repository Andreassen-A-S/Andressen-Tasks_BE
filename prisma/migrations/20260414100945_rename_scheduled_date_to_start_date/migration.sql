/*
  Warnings:

  - You are about to drop the column `scheduled_date` on the `tasks` table. All the data in the column will be lost.
  - Added the required column `start_date` to the `tasks` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `tasks_scheduled_date_idx` ON `tasks`;

-- AlterTable
ALTER TABLE `tasks` RENAME COLUMN `scheduled_date` TO `start_date`;

-- CreateIndex
CREATE INDEX `tasks_start_date_idx` ON `tasks`(`start_date`);
