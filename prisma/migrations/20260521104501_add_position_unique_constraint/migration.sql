/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,name]` on the table `positions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `positions_organization_id_name_key` ON `positions`(`organization_id`, `name`);
