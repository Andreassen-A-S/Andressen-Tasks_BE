-- Create recurring template goals as a separate default-goal entity.
CREATE TABLE `recurring_template_goals` (
    `goal_id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `target_quantity` DOUBLE NOT NULL,
    `current_quantity` DOUBLE NOT NULL DEFAULT 0,
    `unit` ENUM('NONE', 'METERS', 'M2', 'M3', 'LOADS', 'PLUGS', 'HOURS', 'TONS', 'KILOMETERS', 'LITERS', 'KILOGRAMS') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `recurring_template_goals_template_id_key`(`template_id`),
    INDEX `recurring_template_goals_template_id_idx`(`template_id`),
    PRIMARY KEY (`goal_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `recurring_template_goals`
    ADD CONSTRAINT `recurring_template_goals_template_id_fkey`
    FOREIGN KEY (`template_id`) REFERENCES `recurring_task_templates`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing template goal defaults into the new table.
INSERT INTO `recurring_template_goals` (`goal_id`, `template_id`, `target_quantity`, `current_quantity`, `unit`, `created_at`)
SELECT UUID(), `id`, `target_quantity`, 0, `unit`, `created_at`
FROM `recurring_task_templates`
WHERE `goal_type` = 'FIXED' AND `target_quantity` IS NOT NULL AND `target_quantity` > 0;

ALTER TABLE `recurring_task_templates`
    DROP COLUMN `goal_type`,
    DROP COLUMN `target_quantity`,
    DROP COLUMN `unit`;
