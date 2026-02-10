/*
  Warnings:

  - Made the column `scheduled_date` on table `tasks` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `tasks` MODIFY `scheduled_date` DATETIME(3) NOT NULL;
