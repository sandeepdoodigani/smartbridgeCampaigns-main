
import "dotenv/config";
import { db } from "./db";
import { users } from "@shared/schema";
import bcrypt from "bcrypt";

async function main() {
    const email = "test@example.com";
    const password = "password123";

    // Check if user exists
    const existingUser = await db.select().from(users).where(users.email === email);
    if (existingUser.length > 0) {
        console.log("User already exists");
        process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.insert(users).values({
        email,
        password: hashedPassword,
        name: "Test User",
        role: "admin",
        isOwner: true,
    }).returning();

    console.log("User created:", newUser);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
