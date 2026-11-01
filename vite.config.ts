// Config de build para deploy tradicional (Node server / Cloud Run).
// O wrapper @lovable.dev/vite-tanstack-config já inclui: tanstackStart, viteReact,
// tailwindcss, tsConfigPaths, injeção de VITE_*, alias @, dedupe e loggers de erro.
// Aqui só trocamos o alvo do Nitro de Cloudflare para node-server.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: { preset: "node-server" },
  tanstackStart: {
    server: { entry: "server" },
  },
});
