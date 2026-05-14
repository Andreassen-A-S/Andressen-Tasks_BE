import { TaskStatus } from "../generated/prisma/client";

// Thrown when a task is not found, or is outside the caller's org scope.
// Org-scoped reads treat out-of-scope tasks as not-found to avoid leaking existence.
export class TaskNotFoundError extends Error {
  constructor(id: string) {
    super(`Task not found: ${id}`);
    this.name = "TaskNotFoundError";
  }
}

// Thrown when a task is already DONE and the caller tries to set it to DONE again.
// A task must be transitioned back before it can be re-completed.
export class TaskAlreadyDoneError extends Error {
  constructor() {
    super("Task is already marked as done and cannot be set to done again.");
    this.name = "TaskAlreadyDoneError";
  }
}

// Thrown when any mutation is attempted on an ARCHIVED task.
// Archived tasks are read-only; they must be un-archived first.
export class TaskArchivedError extends Error {
  constructor() {
    super("Task is archived and cannot be modified.");
    this.name = "TaskArchivedError";
  }
}

// Thrown when an assignment is not found.
// Used both for direct assignment lookups (assignment CRUD) and when a non-admin
// user tries to log progress but has no assignment on the task.
// Admins may log progress on any task in their org regardless of assignment.
export class AssignmentNotFoundError extends Error {
  constructor(message = "Assignment not found.") {
    super(message);
    this.name = "AssignmentNotFoundError";
  }
}

// Thrown when a progress log is attempted on a task in a terminal or archived state.
export class TaskNotProgressableError extends Error {
  constructor(status: TaskStatus) {
    super(`Cannot log progress on tasks with status: ${status}`);
    this.name = "TaskNotProgressableError";
  }
}

// Thrown when a write operation would create a cross-organization reference.
// Example: assigning a user from org-B to a task in org-A.
// Super-admins bypass org scoping intentionally; this only fires for org-scoped calls.
export class CrossOrganizationReferenceError extends Error {
  constructor(message = "Referenced records must belong to the same organization.") {
    super(message);
    this.name = "CrossOrganizationReferenceError";
  }
}

// Thrown when an operation is not permitted for the caller's role.
// Example: a USER trying to create another user.
export class ForbiddenUserOperationError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenUserOperationError";
  }
}

// Thrown when the requested role is not valid for the actor's permission level.
// Example: an ADMIN attempting to create a SUPER_ADMIN.
export class InvalidUserRoleError extends Error {
  constructor() {
    super("Invalid role");
    this.name = "InvalidUserRoleError";
  }
}

// Thrown when an org-scoped operation is attempted but no org context is available.
// Typically means a non-super-admin user has no organization_id on their account.
export class MissingOrganizationError extends Error {
  constructor(message = "No organization assigned") {
    super(message);
    this.name = "MissingOrganizationError";
  }
}

// Thrown when super-admin creates a user but omits organization_id.
// Unlike MissingOrganizationError (403), this maps to 400 — caller sent an incomplete body.
export class RequiredOrganizationIdError extends MissingOrganizationError {
  constructor() {
    super("organization_id is required");
    this.name = "RequiredOrganizationIdError";
  }
}

// Thrown when a user record is not found, or is outside the caller's org scope.
export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = "UserNotFoundError";
  }
}

// Thrown when an assignment would reference a task or user outside the caller's org.
// Example: assigning a user from org-B to a task in org-A.
export class AssignmentCrossOrganizationError extends Error {
  constructor(message = "Assignment references entities in different organizations.") {
    super(message);
    this.name = "AssignmentCrossOrganizationError";
  }
}

// Thrown when a project is not found, or is outside the caller's org scope.
export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = "ProjectNotFoundError";
  }
}

// Thrown when an organization is not found by ID.
export class OrganizationNotFoundError extends Error {
  constructor(id: string) {
    super(`Organization not found: ${id}`);
    this.name = "OrganizationNotFoundError";
  }
}

// Thrown when the MesterPlan organization is targeted for deletion.
// This org is the platform owner and must never be deleted.
export class ProtectedOrganizationError extends Error {
  constructor() {
    super("This organization cannot be deleted.");
    this.name = "ProtectedOrganizationError";
  }
}

// Thrown when a comment is not found or the caller lacks access to it.
export class CommentNotFoundError extends Error {
  constructor() {
    super("Comment not found.");
    this.name = "CommentNotFoundError";
  }
}

// Thrown when a caller tries to modify a comment they did not create.
// Admins and super-admins may override this via their role check.
export class CommentForbiddenError extends Error {
  constructor() {
    super("You do not have permission to modify this comment.");
    this.name = "CommentForbiddenError";
  }
}

// Thrown when an attachment is not found.
export class AttachmentNotFoundError extends Error {
  constructor() {
    super("Attachment not found.");
    this.name = "AttachmentNotFoundError";
  }
}

// Thrown when a caller lacks the required task access for an attachment operation.
// Task access requires: task creator, assigned user, admin, or super-admin.
export class AttachmentAccessError extends Error {
  constructor() {
    super("You do not have access to this task.");
    this.name = "AttachmentAccessError";
  }
}

// Thrown when a user is already assigned to the target task.
export class DuplicateAssignmentError extends Error {
  constructor() {
    super("User is already assigned to this task.");
    this.name = "DuplicateAssignmentError";
  }
}

// Thrown when one or more upload tokens are invalid, expired, or already used.
export class InvalidUploadTokenError extends Error {
  constructor() {
    super("One or more upload tokens are invalid or expired.");
    this.name = "InvalidUploadTokenError";
  }
}
