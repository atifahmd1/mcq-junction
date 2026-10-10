import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Match Next.js env loading: .env first, then .env.local overrides.
config({ path: ".env" });
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations, introspect, and other CLI commands need a session-mode
    // connection (DIRECT_URL, port 5432). Transaction-mode pooling (port 6543)
    // is not reliable for migrate because it cannot hold session state.
    url: env("DIRECT_URL"),
  },
});
