-- Prevent hard-deleting a user from cascading into user-owned production data.
-- Application-level user deletion is a soft delete via users.status = TERMINATED.

ALTER TABLE `recurring_task_templates` DROP FOREIGN KEY `recurring_task_templates_created_by_fkey`;
ALTER TABLE `projects` DROP FOREIGN KEY `projects_created_by_fkey`;
ALTER TABLE `tasks` DROP FOREIGN KEY `tasks_created_by_fkey`;
ALTER TABLE `task_attachments` DROP FOREIGN KEY `task_attachments_uploaded_by_fkey`;

ALTER TABLE `recurring_task_templates`
    ADD CONSTRAINT `recurring_task_templates_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `projects`
    ADD CONSTRAINT `projects_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `tasks`
    ADD CONSTRAINT `tasks_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `task_attachments`
    ADD CONSTRAINT `task_attachments_uploaded_by_fkey`
    FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`user_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
