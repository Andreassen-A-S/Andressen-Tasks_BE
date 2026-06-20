-- AlterTable
ALTER TABLE `task_comments`
    ADD COLUMN `reply_to_comment_id` VARCHAR(191) NULL,
    ADD COLUMN `reply_preview` TEXT NULL,
    ADD COLUMN `reply_author_name` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `task_comments_reply_to_comment_id_idx`
    ON `task_comments`(`reply_to_comment_id`);

-- AddForeignKey
ALTER TABLE `task_comments`
    ADD CONSTRAINT `task_comments_reply_to_comment_id_fkey`
    FOREIGN KEY (`reply_to_comment_id`)
    REFERENCES `task_comments`(`comment_id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
