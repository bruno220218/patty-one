// Configuração própria (sem Lovable). Build para Cloudflare Workers via nitro.
// Nunca defina ssr.external/resolve.external: o Worker não resolve módulos em runtime.
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: { host: "::", port: 8080 },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // src/server.ts é o nosso wrapper de erros do SSR.
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      ...(command === "build"
        ? [
            nitro({
              preset: "cloudflare-module",
              cloudflare: {
                nodeCompat: true,
                deployConfig: true,
                wrangler: {
                  name: "patty-one",
                  // Valores públicos (a chave publishable pode ficar visível).
                  // A SUPABASE_SERVICE_ROLE_KEY vai como secret no painel da Cloudflare.
                  vars: {
                    SUPABASE_URL: env["SUPABASE_URL"] ?? "",
                    SUPABASE_PUBLISHABLE_KEY: env["SUPABASE_PUBLISHABLE_KEY"] ?? "",
                  },
                },
              },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
