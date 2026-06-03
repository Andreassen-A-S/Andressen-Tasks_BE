/**
 * One-time migration: converts profile_picture_url values in the users table
 * from GCS path format ("users/<id>/profile.jpg") to full public URLs
 * ("https://storage.googleapis.com/<bucket>/users/<id>/profile.jpg").
 *
 * Run inside the Docker container:
 *   docker compose exec backend bun run scripts/migrate-profile-picture-urls.ts
 */
import { prisma } from "../src/db/prisma";
import { getPublicAssetUrl } from "../src/services/storageService";
import { isUserProfilePicturePath } from "../src/repositories/userRepository";

async function run() {
  const users = await prisma.user.findMany({
    where: { profile_picture_url: { not: null } },
    select: { user_id: true, profile_picture_url: true },
  });

  const stale = users.filter(
    (u) => u.profile_picture_url && isUserProfilePicturePath(u.profile_picture_url),
  );

  console.log(`${stale.length} of ${users.length} users need migration`);

  for (const u of stale) {
    const newUrl = getPublicAssetUrl(u.profile_picture_url!);
    await prisma.user.update({
      where: { user_id: u.user_id },
      data: { profile_picture_url: newUrl },
    });
    console.log(`  ${u.user_id}: ${u.profile_picture_url} → ${newUrl}`);
  }

  console.log("Done");
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
