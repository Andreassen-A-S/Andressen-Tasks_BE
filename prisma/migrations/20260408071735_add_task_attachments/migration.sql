-- AlterTable
ALTER TABLE `task_events` MODIFY `type` ENUM('TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED', 'TASK_STATUS_CHANGED', 'TASK_PRIORITY_CHANGED', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_DELETED', 'COMMENT_CREATED', 'COMMENT_UPDATED', 'COMMENT_DELETED', 'PROGRESS_LOGGED', 'SUBTASK_ADDED', 'SUBTASK_REMOVED', 'RECURRING_TEMPLATE_CREATED', 'RECURRING_TEMPLATE_UPDATED', 'RECURRING_TEMPLATE_DEACTIVATED', 'RECURRING_INSTANCE_GENERATED', 'PHOTO_UPLOADED', 'PHOTO_DELETED') NOT NULL;

-- CreateTable
CREATE TABLE `task_attachments` (
    `attachment_id` VARCHAR(191) NOT NULL,
    `comment_id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `uploaded_by` VARCHAR(191) NOT NULL,
    `type` ENUM('IMAGE', 'FILE') NOT NULL DEFAULT 'IMAGE',
    `gcs_path` VARCHAR(191) NOT NULL,
    `public_url` TEXT NOT NULL,
    `file_name` VARCHAR(191) NULL,
    `mime_type` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_attachments_task_id_idx`(`task_id`),
    INDEX `task_attachments_comment_id_idx`(`comment_id`),
    INDEX `task_attachments_uploaded_by_idx`(`uploaded_by`),
    PRIMARY KEY (`attachment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `task_attachments` ADD CONSTRAINT `task_attachments_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `task_comments`(`comment_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_attachments` ADD CONSTRAINT `task_attachments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_attachments` ADD CONSTRAINT `task_attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
