/*
  Migration notes:
  - Renames `scheduled_date` to `start_date` on the `tasks` table.
  - Replaces the related index so it matches the renamed column.
  - This migration does not drop task date data or add a new required column.
*/
-- DropIndex
DROP INDEX `tasks_scheduled_date_idx` ON `tasks`;

-- AlterTable
ALTER TABLE `tasks` RENAME COLUMN `scheduled_date` TO `start_date`;

-- CreateIndex
CREATE INDEX `tasks_start_date_idx` ON `tasks`(`start_date`);
