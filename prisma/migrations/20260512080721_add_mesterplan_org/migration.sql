-- Insert MesterPlan as the internal staff organization
INSERT INTO organizations (org_id, name, slug, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'MesterPlan',
  'mesterplan',
  NOW(),
  NOW()
);

-- Reassign any existing SUPER_ADMIN users to the MesterPlan org
UPDATE users
SET organization_id = '00000000-0000-0000-0000-000000000002'
WHERE role = 'SUPER_ADMIN';