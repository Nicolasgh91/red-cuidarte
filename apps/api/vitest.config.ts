import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/globalSetup.ts"],
    include: ["test/**/*.test.ts"],
    // Todos los archivos comparten la misma base de pruebas: se corren de a uno.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
