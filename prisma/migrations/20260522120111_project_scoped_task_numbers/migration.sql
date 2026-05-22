/*
  Warnings:

  - You are about to drop the `org_task_counters` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[project_id,number]` on the table `tasks` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `org_task_counters` DROP FOREIGN KEY `org_task_counters_org_id_fkey`;

-- DropTable
DROP TABLE `org_task_counters`;

-- CreateTable
CREATE TABLE `project_task_counters` (
    `project_id` VARCHAR(191) NOT NULL,
    `last_number` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_task_counters` ADD CONSTRAINT `project_task_counters_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: reset and re-assign sequential numbers per project, ordered by created_at
-- (must run before the unique index is created to avoid duplicate-zero violations)
UPDATE `tasks` SET `number` = 0;

UPDATE `tasks` t
INNER JOIN (
    SELECT
        t2.`task_id`,
        ROW_NUMBER() OVER (PARTITION BY t2.`project_id` ORDER BY t2.`created_at` ASC) AS new_number
    FROM `tasks` t2
) ranked ON t.`task_id` = ranked.`task_id`
SET t.`number` = ranked.`new_number`;

-- Seed counters from max task number per project
-- (table is always empty at this point in the migration, so no duplicate handling needed)
INSERT INTO `project_task_counters` (`project_id`, `last_number`)
SELECT `project_id`, MAX(`number`)
FROM `tasks`
GROUP BY `project_id`;

-- CreateIndex: added after backfill so all numbers are correctly assigned first
CREATE UNIQUE INDEX `tasks_project_id_number_key` ON `tasks`(`project_id`, `number`);
