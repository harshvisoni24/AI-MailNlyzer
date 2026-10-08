import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Creates only the roles. No default users are created: every person signs
// up on their own and gets their own private account.
async function main() {
  const roleNames = ["ADMIN", "SECURITY_ANALYST", "INVESTIGATOR", "VIEWER"] as const;
  for (const name of roleNames) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log("Roles ready. No default users created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
