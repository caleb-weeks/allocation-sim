import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // API tests share one database; run files one at a time.
    fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://caleb@localhost:5432/allocation_sim_test" },
  },
});
