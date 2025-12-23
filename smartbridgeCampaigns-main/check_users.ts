
import "dotenv/config";
import { db } from "./db";
import { users } from "@shared/schema";

async function main() {
    const allUsers = await db.select().from(users);
    console.log("Users found:", allUsers);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
