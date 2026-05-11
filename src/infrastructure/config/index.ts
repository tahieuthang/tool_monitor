import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("3000"),
  GITHUB_PAT: z.string().optional(), // Make it optional if public repo
  API_KEY: z.string().min(1, "API_KEY is required for security"), // Require API key
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1); // Fail-fast
}

export const config = parsed.data;
