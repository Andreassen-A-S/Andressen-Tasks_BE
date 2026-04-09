import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} environment variable is not set`);
  return value;
}

let _storage: Storage | null = null;
let _bucketName: string | null = null;

function getStorage(): Storage {
  if (!_storage) {
    _storage = new Storage({
      projectId: requireEnv("GCS_PROJECT_ID"),
      credentials: JSON.parse(requireEnv("GCS_CREDENTIALS")),
    });
  }
  return _storage;
}

function getBucketName(): string {
  if (!_bucketName) _bucketName = requireEnv("GCS_BUCKET_NAME");
  return _bucketName;
}

export function getPublicUrl(gcsPath: string): string {
  return `https://storage.googleapis.com/${getBucketName()}/${gcsPath}`;
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export async function generateSignedUploadUrl(
  taskId: string,
  fileName: string,
  mimeType: string,
): Promise<{ uploadUrl: string; gcsPath: string; publicUrl: string }> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported mime type: ${mimeType}`);
  }
  const ext = MIME_TO_EXT[mimeType];
  const gcsPath = `tasks/${taskId}/${randomUUID()}.${ext}`;
  const file = getStorage().bucket(getBucketName()).file(gcsPath);

  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: mimeType,
  });

  return { uploadUrl, gcsPath, publicUrl: getPublicUrl(gcsPath) };
}

export async function generateSignedReadUrl(gcsPath: string): Promise<string> {
  const [url] = await getStorage()
    .bucket(getBucketName())
    .file(gcsPath)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });
  return url;
}

export async function deleteFile(gcsPath: string): Promise<void> {
  await getStorage()
    .bucket(getBucketName())
    .file(gcsPath)
    .delete({ ignoreNotFound: true });
}
