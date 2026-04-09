-- Step 1: add upload_token as nullable, plus the other columns
ALTER TABLE `task_attachments`
    ADD COLUMN `file_size` INTEGER NULL,
    ADD COLUMN `status` ENUM('PENDING', 'CONFIRMED') NOT NULL DEFAULT 'CONFIRMED',
    ADD COLUMN `upload_token` VARCHAR(191) NULL,
    MODIFY `comment_id` VARCHAR(191) NULL;

-- Step 2: backfill existing rows with a UUID each
UPDATE `task_attachments` SET `upload_token` = (UUID()) WHERE `upload_token` IS NULL;

-- Step 3: make upload_token NOT NULL now that all rows have a value
ALTER TABLE `task_attachments` MODIFY `upload_token` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `task_attachments_upload_token_key` ON `task_attachments`(`upload_token`);

-- CreateIndex
CREATE INDEX `task_attachments_status_created_at_idx` ON `task_attachments`(`status`, `created_at`);
