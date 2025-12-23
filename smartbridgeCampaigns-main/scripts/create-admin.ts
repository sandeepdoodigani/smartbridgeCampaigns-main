
import "dotenv/config";
import { db } from "../db/index";
import { users } from "../shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.env.ADMIN_EMAIL || "sandeep@thesmartbridge.com";
  const password = process.env.ADMIN_PASSWORD || "3rdG5p7@12";

  console.log(`Checking for admin user: ${email}`);

  const existingUser = await db.select().from(users).where(eq(users.email, email));

  if (existingUser.length > 0) {
    console.log("Admin user already exists.");
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await db.insert(users).values({
    email,
    password: hashedPassword,
    name: "Admin User",
    role: "admin",
    isOwner: true,
  });

  console.log("Admin user created successfully!");
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create admin user:", err);
  process.exit(1);
});
