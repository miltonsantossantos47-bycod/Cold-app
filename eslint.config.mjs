import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// O Next.js 16 deixou de ter o `next lint`: a configuração passa a ser a do ESLint 9 ("flat config").
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".open-next/**", ".wrangler/**", "out/**", "build/**", "next-env.d.ts", "cloudflare-env.d.ts"]),
]);
