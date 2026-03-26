-- Add project_id to recurring_task_templates with default pointing to the existing project
ALTER TABLE `recurring_task_templates`
  ADD COLUMN `project_id` VARCHAR(191) NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001';

ALTER TABLE `recurring_task_templates`
  ALTER COLUMN `project_id` DROP DEFAULT;

CREATE INDEX `recurring_task_templates_project_id_idx` ON `recurring_task_templates`(`project_id`);

ALTER TABLE `recurring_task_templates`
  ADD CONSTRAINT `recurring_task_templates_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
