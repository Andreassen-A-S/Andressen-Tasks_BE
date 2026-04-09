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
    const raw = requireEnv("GCS_CREDENTIALS");
    let credentials: object;
    try {
      credentials = JSON.parse(raw);
    } catch {
      throw new Error("GCS_CREDENTIALS must be valid JSON — check for unescaped newlines or missing quotes");
    }
    _storage = new Storage({ projectId: requireEnv("GCS_PROJECT_ID"), credentials });
  }
  return _storage;
}

function getBucketName(): string {
  if (!_bucketName) _bucketName = requireEnv("GCS_BUCKET_NAME");
  return _bucketName;
}

export function getPublicUrl(gcsPath: string): string {
  const encodedPath = gcsPath.split("/").map(encodeURIComponent).join("/");
  return `https://storage.googleapis.com/${getBucketName()}/${encodedPath}`;
}

export const ALLOWED_MIME_TYPES: Record<string, { ext: string; maxBytes: number }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 10 * 1024 * 1024 },
  "image/png":  { ext: "png", maxBytes: 10 * 1024 * 1024 },
  "image/webp": { ext: "webp", maxBytes: 10 * 1024 * 1024 },
  "image/heic": { ext: "heic", maxBytes: 10 * 1024 * 1024 },
  // "application/pdf": { ext: "pdf", maxBytes: 50 * 1024 * 1024 },
  // "video/mp4":       { ext: "mp4", maxBytes: 200 * 1024 * 1024 },
};

export async function generateSignedUploadUrl(
  taskId: string,
  mimeType: string,
): Promise<{ uploadUrl: string; gcsPath: string; url: string }> {
  const config = ALLOWED_MIME_TYPES[mimeType];
  if (!config) {
    throw new Error(`Unsupported mime type: ${mimeType}`);
  }
  const ext = config.ext;
  const gcsPath = `tasks/${taskId}/${randomUUID()}.${ext}`;
  const file = getStorage().bucket(getBucketName()).file(gcsPath);

  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: mimeType,
  });

  return { uploadUrl, gcsPath, url: getPublicUrl(gcsPath) };
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
