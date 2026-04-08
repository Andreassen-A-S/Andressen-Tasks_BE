import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";

function getCredentials() {
  const keyFile = process.env.GCS_KEY_FILE;
  if (!keyFile) throw new Error("GCS_KEY_FILE environment variable is not set");
  return JSON.parse(readFileSync(keyFile, "utf-8"));
}

function getStorage(): Storage {
  const projectId = process.env.GCS_PROJECT_ID;
  if (!projectId)
    throw new Error("GCS_PROJECT_ID environment variable is not set");
  return new Storage({ credentials: getCredentials(), projectId });
}

function getBucketName(): string {
  const bucket = process.env.GCS_BUCKET_NAME;
  if (!bucket)
    throw new Error("GCS_BUCKET_NAME environment variable is not set");
  return bucket;
}

export function getPublicUrl(gcsPath: string): string {
  return `https://storage.googleapis.com/${getBucketName()}/${gcsPath}`;
}

export async function generateSignedUploadUrl(
  taskId: string,
  fileName: string,
  mimeType: string,
): Promise<{ uploadUrl: string; gcsPath: string; publicUrl: string }> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
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
  try {
    await getStorage()
      .bucket(getBucketName())
      .file(gcsPath)
      .delete({ ignoreNotFound: true });
  } catch (err) {
    console.error("GCS delete failed for path:", gcsPath, err);
  }
}
