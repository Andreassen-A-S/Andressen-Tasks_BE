-- Step 1: Create task_goals table
CREATE TABLE `task_goals` (
    `goal_id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `target_quantity` DOUBLE NOT NULL,
    `current_quantity` DOUBLE NOT NULL DEFAULT 0,
    `unit` ENUM('NONE', 'METERS', 'M2', 'M3', 'LOADS', 'PLUGS', 'HOURS', 'TONS', 'KILOMETERS', 'LITERS', 'KILOGRAMS') NOT NULL,
    `removed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `task_goals_task_id_idx`(`task_id`),
    INDEX `task_goals_task_id_removed_at_idx`(`task_id`, `removed_at`),
    PRIMARY KEY (`goal_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 2: FK task_goals → tasks
ALTER TABLE `task_goals` ADD CONSTRAINT `task_goals_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Migrate active goals from tasks
INSERT INTO `task_goals` (`goal_id`, `task_id`, `target_quantity`, `current_quantity`, `unit`, `created_at`)
SELECT UUID(), `task_id`, `target_quantity`, COALESCE(`current_quantity`, 0), `unit`, `created_at`
FROM `tasks`
WHERE `goal_type` = 'FIXED' AND `target_quantity` IS NOT NULL AND `target_quantity` > 0;

-- Step 4: Create placeholder removed goals for tasks that have progress logs but no goal row yet
INSERT INTO `task_goals` (`goal_id`, `task_id`, `target_quantity`, `current_quantity`, `unit`, `removed_at`, `created_at`)
SELECT UUID(), ta.`task_id`,
    GREATEST(COALESCE(t.`current_quantity`, 0), 1),
    COALESCE(t.`current_quantity`, 0),
    COALESCE(t.`unit`, 'NONE'),
    NOW(),
    t.`created_at`
FROM `task_progress_logs` tpl
JOIN `task_assignments` ta ON tpl.`assignment_id` = ta.`assignment_id`
JOIN `tasks` t ON ta.`task_id` = t.`task_id`
WHERE NOT EXISTS (
    SELECT 1 FROM `task_goals` tg WHERE tg.`task_id` = ta.`task_id`
)
GROUP BY ta.`task_id`;

-- Step 5: Add goal_id to task_progress_logs as nullable first
ALTER TABLE `task_progress_logs` ADD COLUMN `goal_id` VARCHAR(191) NULL;

-- Step 6: Populate goal_id for each progress log via its task's goal
UPDATE `task_progress_logs` tpl
JOIN `task_assignments` ta ON tpl.`assignment_id` = ta.`assignment_id`
JOIN `task_goals` tg ON tg.`task_id` = ta.`task_id`
SET tpl.`goal_id` = tg.`goal_id`
WHERE tpl.`goal_id` IS NULL;

-- Step 7: Drop any progress logs that couldn't be linked (safety)
DELETE FROM `task_progress_logs` WHERE `goal_id` IS NULL;

-- Step 8: Make goal_id NOT NULL
ALTER TABLE `task_progress_logs` MODIFY COLUMN `goal_id` VARCHAR(191) NOT NULL;

-- Step 9: Index and FK for task_progress_logs.goal_id
CREATE INDEX `task_progress_logs_goal_id_idx` ON `task_progress_logs`(`goal_id`);
ALTER TABLE `task_progress_logs` ADD CONSTRAINT `task_progress_logs_goal_id_fkey` FOREIGN KEY (`goal_id`) REFERENCES `task_goals`(`goal_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 10: Rename/remove old goal event types before altering the enum
UPDATE `task_events` SET `type` = 'TASK_GOAL_SET' WHERE `type` = 'TASK_GOAL_ADDED';
DELETE FROM `task_events` WHERE `type` = 'TASK_GOAL_CHANGED';

-- Step 11: Alter task_events enum
ALTER TABLE `task_events` MODIFY `type` ENUM('TASK_CREATED','TASK_TITLE_CHANGED','TASK_DESCRIPTION_CHANGED','TASK_DUE_DATE_CHANGED','TASK_PRIORITY_CHANGED','TASK_PROJECT_CHANGED','TASK_STATUS_CHANGED','TASK_GOAL_SET','TASK_GOAL_REMOVED','TASK_DELETED','ASSIGNMENT_CREATED','ASSIGNMENT_DELETED','COMMENT_CREATED','COMMENT_UPDATED','COMMENT_DELETED','PROGRESS_LOGGED','SUBTASK_ADDED','SUBTASK_REMOVED','RECURRING_TEMPLATE_CREATED','RECURRING_TEMPLATE_UPDATED','RECURRING_TEMPLATE_DEACTIVATED','RECURRING_INSTANCE_GENERATED') NOT NULL;

-- Step 12: Drop goal columns from tasks
ALTER TABLE `tasks`
    DROP COLUMN `current_quantity`,
    DROP COLUMN `goal_type`,
    DROP COLUMN `target_quantity`,
    DROP COLUMN `unit`;
