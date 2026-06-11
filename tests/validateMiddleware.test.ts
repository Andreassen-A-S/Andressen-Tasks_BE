import { describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import { validate } from "../src/middleware/validateMiddleware";
import { ValidationError } from "../src/errors/domainErrors";

function makeReqRes(body: unknown) {
  const req = { body } as any;
  const res = {} as any;
  return { req, res };
}

describe("validate middleware", () => {
  const schema = z.object({
    name: z.string("name is required").trim().min(1, "name is required"),
    count: z.number().positive("count must be positive").optional(),
  });

  test("calls next() and sets req.body to parsed data when valid", () => {
    const { req, res } = makeReqRes({ name: "  hello  ", count: 3 });
    const next = mock();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: "hello", count: 3 });
  });

  test("trims string fields before setting req.body", () => {
    const { req, res } = makeReqRes({ name: "  world  " });
    const next = mock();

    validate(schema)(req, res, next);

    expect(req.body.name).toBe("world");
  });

  test("calls next(ValidationError) with fields when required field is missing", () => {
    const { req, res } = makeReqRes({});
    const next = mock();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("Validation failed");
    expect(error.fields).toHaveProperty("name");
  });

  test("calls next(ValidationError) with field key when type is wrong", () => {
    const { req, res } = makeReqRes({ name: "ok", count: -5 });
    const next = mock();

    validate(schema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("count");
    expect(error.fields.count).toBe("count must be positive");
  });

  test("uses _root key for schema-level issues with empty path", () => {
    const crossSchema = z
      .object({ a: z.string().optional(), b: z.string().optional() })
      .superRefine((data, ctx) => {
        if (!data.a && !data.b) {
          ctx.addIssue({ code: "custom", path: [], message: "a or b is required" });
        }
      });

    const { req, res } = makeReqRes({});
    const next = mock();

    validate(crossSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error.fields).toHaveProperty("_root", "a or b is required");
  });

  test("only records the first error per field path", () => {
    const multiSchema = z.object({
      name: z.string("name is required").min(5, "name too short"),
    });

    const { req, res } = makeReqRes({});
    const next = mock();

    validate(multiSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(Object.keys(error.fields)).toHaveLength(1);
  });
});

describe("validate middleware — organization schema integration", () => {
  const { createOrganizationSchema } = require("../src/schemas/organizationSchemas");

  test("returns 400 with field error when name is missing", () => {
    const { req, res } = makeReqRes({ slug: "acme" });
    const next = mock();

    validate(createOrganizationSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("name");
  });

  test("returns 400 with field error when slug is missing", () => {
    const { req, res } = makeReqRes({ name: "Acme" });
    const next = mock();

    validate(createOrganizationSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error.fields).toHaveProperty("slug");
  });

  test("passes and trims name and slug when both provided", () => {
    const { req, res } = makeReqRes({ name: "  Acme  ", slug: "  acme  " });
    const next = mock();

    validate(createOrganizationSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.name).toBe("Acme");
    expect(req.body.slug).toBe("acme");
  });
});

describe("validate middleware — task schema integration", () => {
  const { createTaskSchema } = require("../src/schemas/taskSchemas");
  const { createSubtaskSchema } = require("../src/schemas/subTaskSchemas");

  test("returns 400 with field error when project_id is missing", () => {
    const { req, res } = makeReqRes({ title: "My task" });
    const next = mock();

    validate(createTaskSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("project_id");
  });

  test("passes with all required fields", () => {
    const { req, res } = makeReqRes({
      project_id: "  p1  ",
      title: "My task",
      priority: "HIGH",
      deadline: "2025-12-31T00:00:00Z",
      start_date: "2025-12-01T00:00:00Z",
    });
    const next = mock();

    validate(createTaskSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.project_id).toBe("p1");
    expect(req.body.title).toBe("My task");
  });

  test("subtask creation passes without project_id and strips supplied project_id", () => {
    const { req, res } = makeReqRes({
      parent_task_id: "  parent-1  ",
      project_id: "client-project",
      title: "Subtask",
      priority: "HIGH",
      deadline: "2025-12-31T00:00:00Z",
      start_date: "2025-12-01T00:00:00Z",
    });
    const next = mock();

    validate(createSubtaskSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.parent_task_id).toBe("parent-1");
    expect(req.body.project_id).toBeUndefined();
  });
});

describe("validate middleware — createComment schema integration", () => {
  const { createCommentSchema } = require("../src/schemas/commentSchemas");

  test("requires message or upload_tokens when body is empty", () => {
    const { req, res } = makeReqRes({});
    const next = mock();

    validate(createCommentSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("message", "Message or attachment is required");
  });

  test("requires message or upload_tokens when message is whitespace-only", () => {
    const { req, res } = makeReqRes({ message: "   " });
    const next = mock();

    validate(createCommentSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("message", "Message or attachment is required");
  });

  test("rejects duplicate upload_tokens", () => {
    const { req, res } = makeReqRes({ upload_tokens: ["tok1", "tok1"] });
    const next = mock();

    validate(createCommentSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("upload_tokens", "Duplicate upload tokens");
  });

  test("passes when message is non-empty", () => {
    const { req, res } = makeReqRes({ message: " hello " });
    const next = mock();

    validate(createCommentSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.message).toBe("hello");
  });

  test("passes when only upload_tokens provided without message", () => {
    const { req, res } = makeReqRes({ upload_tokens: ["tok1"] });
    const next = mock();

    validate(createCommentSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe("validate middleware — updateComment schema integration", () => {
  const { updateCommentSchema } = require("../src/schemas/commentSchemas");

  test("rejects empty body with _root error", () => {
    const { req, res } = makeReqRes({});
    const next = mock();

    validate(updateCommentSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("_root", "No changes provided");
  });

  test("rejects non-array upload_tokens", () => {
    const { req, res } = makeReqRes({ message: "ok", upload_tokens: "not-array" });
    const next = mock();

    validate(updateCommentSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("upload_tokens");
  });

  test("rejects duplicate upload_tokens", () => {
    const { req, res } = makeReqRes({ upload_tokens: ["tok1", "tok1"] });
    const next = mock();

    validate(updateCommentSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("upload_tokens", "Duplicate upload tokens");
  });

  test("rejects non-array remove_attachment_ids", () => {
    const { req, res } = makeReqRes({ message: "ok", remove_attachment_ids: "not-array" });
    const next = mock();

    validate(updateCommentSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("remove_attachment_ids");
  });

  test("passes with only message", () => {
    const { req, res } = makeReqRes({ message: "updated" });
    const next = mock();

    validate(updateCommentSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.message).toBe("updated");
  });

  test("passes with only remove_attachment_ids", () => {
    const { req, res } = makeReqRes({ remove_attachment_ids: ["a1"] });
    const next = mock();

    validate(updateCommentSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe("validate middleware — prepareAttachments schema integration", () => {
  const { prepareAttachmentsSchema } = require("../src/schemas/attachmentSchemas");
  const validFile = { mime_type: "image/jpeg", file_size: 1024 };

  test("rejects missing task_id", () => {
    const { req, res } = makeReqRes({ files: [validFile] });
    const next = mock();

    validate(prepareAttachmentsSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("task_id");
  });

  test("rejects empty files array", () => {
    const { req, res } = makeReqRes({ task_id: "t1", files: [] });
    const next = mock();

    validate(prepareAttachmentsSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("files");
  });

  test("rejects more than 20 files", () => {
    const { req, res } = makeReqRes({
      task_id: "t1",
      files: Array.from({ length: 21 }, () => ({ ...validFile })),
    });
    const next = mock();

    validate(prepareAttachmentsSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toHaveProperty("files", "Maximum 20 files per request");
  });

  test("rejects unsupported mime_type", () => {
    const { req, res } = makeReqRes({
      task_id: "t1",
      files: [{ mime_type: "application/x-msdownload", file_size: 1024 }],
    });
    const next = mock();

    validate(prepareAttachmentsSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields["files.0.mime_type"]).toBe("Unsupported file type");
  });

  test("rejects negative file_size", () => {
    const { req, res } = makeReqRes({
      task_id: "t1",
      files: [{ mime_type: "image/jpeg", file_size: -1 }],
    });
    const next = mock();

    validate(prepareAttachmentsSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields["files.0.file_size"]).toBeDefined();
  });


  test("passes valid attachment request", () => {
    const { req, res } = makeReqRes({ task_id: "t1", files: [validFile] });
    const next = mock();

    validate(prepareAttachmentsSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.task_id).toBe("t1");
  });
});

describe("loginSchema", () => {
  const { loginSchema } = require("../src/schemas/authSchemas");

  test("rejects missing email", () => {
    const { req, res } = makeReqRes({ password: "secret" });
    const next = mock();

    validate(loginSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields.email).toBeDefined();
  });

  test("rejects empty password", () => {
    const { req, res } = makeReqRes({ email: "a@b.com", password: "" });
    const next = mock();

    validate(loginSchema)(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields.password).toBeDefined();
  });

  test("passes valid credentials and trims email", () => {
    const { req, res } = makeReqRes({ email: "  a@b.com  ", password: "secret" });
    const next = mock();

    validate(loginSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.email).toBe("a@b.com");
  });
});
