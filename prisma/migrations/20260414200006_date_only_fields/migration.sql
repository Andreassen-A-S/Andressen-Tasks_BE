-- AlterTable
ALTER TABLE `recurring_task_templates` MODIFY `start_date` DATE NOT NULL,
    MODIFY `end_date` DATE NULL;

-- AlterTable
ALTER TABLE `tasks` MODIFY `deadline` DATE NOT NULL,
    MODIFY `start_date` DATE NOT NULL;
