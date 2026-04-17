-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('USER', 'ADMIN', 'SYSTEM') NOT NULL DEFAULT 'USER';

-- Insert system scheduler user (fixed UUID, cannot log in)
INSERT INTO `users` (`user_id`, `name`, `email`, `password`, `role`, `created_at`, `updated_at`)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Systemet',
  'scheduler@system.internal',
  'SYSTEM_ACCOUNT_NO_PASSWORD',
  'SYSTEM',
  NOW(),
  NOW()
) ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  role = VALUES(role),
  password = VALUES(password),
  updated_at = VALUES(updated_at);
