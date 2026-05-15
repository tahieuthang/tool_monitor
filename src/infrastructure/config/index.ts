import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("3000"),
  GITHUB_PAT: z.string().optional(), // Make it optional if public repo
  API_SECRET_TOKEN: z
    .string()
    .min(1, "API_SECRET_TOKEN is required for authentication")
    .transform((s) => s.trim()), // trim trailing newline/spaces from .env
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1); // Fail-fast
}

export const config = parsed.data;
