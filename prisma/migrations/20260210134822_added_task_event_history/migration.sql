-- CreateTable
CREATE TABLE `task_events` (
    `event_id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `type` ENUM('CREATED', 'UPDATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'COMMENTED', 'PROGRESS_LOGGED', 'SUBTASK_ADDED', 'SUBTASK_REMOVED') NOT NULL,
    `message` TEXT NULL,
    `comment_id` VARCHAR(191) NULL,
    `progress_id` VARCHAR(191) NULL,
    `assignment_id` VARCHAR(191) NULL,
    `before_json` JSON NULL,
    `after_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_events_task_id_created_at_idx`(`task_id`, `created_at`),
    INDEX `task_events_type_created_at_idx`(`type`, `created_at`),
    INDEX `task_events_comment_id_idx`(`comment_id`),
    INDEX `task_events_progress_id_idx`(`progress_id`),
    INDEX `task_events_assignment_id_idx`(`assignment_id`),
    PRIMARY KEY (`event_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `task_events` ADD CONSTRAINT `task_events_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_events` ADD CONSTRAINT `task_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_events` ADD CONSTRAINT `task_events_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `task_comments`(`comment_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_events` ADD CONSTRAINT `task_events_progress_id_fkey` FOREIGN KEY (`progress_id`) REFERENCES `task_progress_logs`(`progress_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_events` ADD CONSTRAINT `task_events_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `task_assignments`(`assignment_id`) ON DELETE SET NULL ON UPDATE CASCADE;
