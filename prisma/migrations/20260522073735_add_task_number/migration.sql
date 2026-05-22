-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `number` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `org_task_counters` (
    `org_id` VARCHAR(191) NOT NULL,
    `last_number` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`org_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `org_task_counters` ADD CONSTRAINT `org_task_counters_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`org_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: assign sequential numbers to existing tasks per org, ordered by created_at
SET @row_num := 0;
SET @current_org := '';

UPDATE `tasks` t
INNER JOIN (
    SELECT
        t2.`task_id`,
        @row_num := IF(BINARY @current_org = BINARY p.`organization_id`, @row_num + 1, 1) AS new_number,
        @current_org := p.`organization_id` AS _org
    FROM `tasks` t2
    INNER JOIN `projects` p ON t2.`project_id` = p.`project_id`
    ORDER BY p.`organization_id`, t2.`created_at` ASC
) ranked ON t.`task_id` = ranked.`task_id`
SET t.`number` = ranked.`new_number`;

-- Seed counters from max task number per org
INSERT INTO `org_task_counters` (`org_id`, `last_number`)
SELECT p.`organization_id`, MAX(t.`number`)
FROM `tasks` t
INNER JOIN `projects` p ON t.`project_id` = p.`project_id`
GROUP BY p.`organization_id`
ON DUPLICATE KEY UPDATE `last_number` = VALUES(`last_number`);
