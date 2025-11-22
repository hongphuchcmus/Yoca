import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ["../.env", "../.env.local"] });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.SERVER_POSTGRE_DB_URL!,
  },
});
