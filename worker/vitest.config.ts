import { randomBytes } from "node:crypto";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

function randomBase64Url(byteLength: number): string {
  return btoa(String.fromCharCode(...randomBytes(byteLength)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          HASH_SALT: `base64url:${randomBase64Url(32)}`,
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
    testTimeout: 10_000,
  },
});
