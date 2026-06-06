import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Add it to .env (see .env.example) or your environment.");
}

const sql = neon(databaseUrl);

export const db = drizzle({ client: sql, schema, casing: "snake_case" });
export type Db = typeof db;
