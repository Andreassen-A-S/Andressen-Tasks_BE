/*
  Warnings:

  - A unique constraint covering the columns `[recurring_template_id,occurrence_date]` on the table `tasks` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `task_events` MODIFY `type` ENUM('TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED', 'TASK_STATUS_CHANGED', 'TASK_PRIORITY_CHANGED', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_DELETED', 'COMMENT_CREATED', 'COMMENT_UPDATED', 'COMMENT_DELETED', 'PROGRESS_LOGGED', 'SUBTASK_ADDED', 'SUBTASK_REMOVED', 'RECURRING_TEMPLATE_CREATED', 'RECURRING_TEMPLATE_UPDATED', 'RECURRING_TEMPLATE_DEACTIVATED', 'RECURRING_INSTANCE_GENERATED') NOT NULL;

-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `occurrence_date` DATETIME(3) NULL,
    ADD COLUMN `recurring_template_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `recurring_task_templates` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'MEDIUM',
    `unit` ENUM('NONE', 'HOURS', 'METERS', 'KILOMETERS', 'LITERS', 'KILOGRAMS') NOT NULL DEFAULT 'NONE',
    `target_quantity` DOUBLE NULL,
    `goal_type` ENUM('OPEN', 'FIXED') NOT NULL DEFAULT 'OPEN',
    `created_by` VARCHAR(191) NOT NULL,
    `recurrence_rule` TEXT NOT NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `recurring_task_templates_created_by_idx`(`created_by`),
    INDEX `recurring_task_templates_is_active_idx`(`is_active`),
    INDEX `recurring_task_templates_start_date_idx`(`start_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recurring_task_template_assignees` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,

    INDEX `recurring_task_template_assignees_template_id_idx`(`template_id`),
    INDEX `recurring_task_template_assignees_user_id_idx`(`user_id`),
    UNIQUE INDEX `recurring_task_template_assignees_template_id_user_id_key`(`template_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `tasks_recurring_template_id_occurrence_date_idx` ON `tasks`(`recurring_template_id`, `occurrence_date`);

-- CreateIndex
CREATE UNIQUE INDEX `tasks_recurring_template_id_occurrence_date_key` ON `tasks`(`recurring_template_id`, `occurrence_date`);

-- AddForeignKey
ALTER TABLE `recurring_task_templates` ADD CONSTRAINT `recurring_task_templates_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_task_template_assignees` ADD CONSTRAINT `recurring_task_template_assignees_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `recurring_task_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_task_template_assignees` ADD CONSTRAINT `recurring_task_template_assignees_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_recurring_template_id_fkey` FOREIGN KEY (`recurring_template_id`) REFERENCES `recurring_task_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
