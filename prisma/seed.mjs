import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seed core data for local/dev bootstrap.
 *
 * Categories: small fixed list used by the feed/category shell.
 * Admin bootstrap (env-gated, no hardcoded secrets):
 *   Set SEED_ADMIN_EMAIL, SEED_ADMIN_HANDLE, and SEED_ADMIN_PASSWORD_HASH
 *   (a pre-hashed password/auth reference) to upsert an initial admin user.
 *   If any are missing, no admin is created. This avoids committing credentials.
 *   Example (PowerShell, provide your own hash):
 *     $env:SEED_ADMIN_EMAIL="admin@example.com"
 *     $env:SEED_ADMIN_HANDLE="admin"
 *     $env:SEED_ADMIN_PASSWORD_HASH="<bcrypt-or-auth-hash>"
 *     npx prisma db seed
 */
async function main() {
  const categories = [
    { slug: "featured", name: "Featured", sortOrder: 0 },
    { slug: "new", name: "New", sortOrder: 1 },
    { slug: "popular", name: "Popular", sortOrder: 2 },
    { slug: "trending", name: "Trending", sortOrder: 3 },
    { slug: "creators", name: "Creators", sortOrder: 4 },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: c.sortOrder, active: true },
      create: { ...c, active: true },
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const handle = process.env.SEED_ADMIN_HANDLE;
  const passwordHash = process.env.SEED_ADMIN_PASSWORD_HASH;
  if (email && handle && passwordHash) {
    await prisma.user.upsert({
      where: { email },
      update: { handle, passwordHash, role: "admin" },
      create: {
        email,
        handle,
        passwordHash,
        role: "admin",
        // Admin bootstrap assumes an operator-confirmed 18+ context.
        ageConfirmedAt: new Date(),
        settings: {
          create: {
            feedLayout: "immersive",
            privacyPrefs: {},
            messagingPrefs: {},
          },
        },
      },
    });
    console.log(`Seeded admin user for ${email} (handle: ${handle}).`);
  } else {
    console.log(
      "Admin bootstrap skipped (set SEED_ADMIN_EMAIL, SEED_ADMIN_HANDLE, SEED_ADMIN_PASSWORD_HASH to create one)."
    );
  }

  console.log(`Seeded ${categories.length} categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
