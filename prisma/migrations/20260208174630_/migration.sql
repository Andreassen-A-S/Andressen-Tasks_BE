/*
  Warnings:

  - A unique constraint covering the columns `[assignment_id]` on the table `task_progress_logs` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `task_progress_logs_assignment_id_key` ON `task_progress_logs`(`assignment_id`);
