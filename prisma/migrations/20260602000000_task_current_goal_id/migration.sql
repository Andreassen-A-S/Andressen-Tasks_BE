-- Add current_goal_id pointer to tasks (nullable, unique — enforces one active goal per task)
ALTER TABLE `tasks` ADD COLUMN `current_goal_id` VARCHAR(191) NULL;

-- Backfill: point each task at its existing active goal (removed_at IS NULL)
UPDATE `tasks` t
SET t.`current_goal_id` = (
  SELECT g.`goal_id`
  FROM `task_goals` g
  WHERE g.`task_id` = t.`task_id`
    AND g.`removed_at` IS NULL
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM `task_goals` g
  WHERE g.`task_id` = t.`task_id` AND g.`removed_at` IS NULL
);

-- Add unique constraint (one active goal per task)
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_current_goal_id_key` UNIQUE (`current_goal_id`);

-- Add foreign key (SET NULL so deleting a goal clears the pointer cleanly)
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_current_goal_id_fkey`
  FOREIGN KEY (`current_goal_id`) REFERENCES `task_goals`(`goal_id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the removed_at column and its index (no longer needed)
DROP INDEX `task_goals_task_id_removed_at_idx` ON `task_goals`;
ALTER TABLE `task_goals` DROP COLUMN `removed_at`;
