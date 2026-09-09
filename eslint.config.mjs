import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright/Chromatic output. These are gitignored, but flat config does
    // not read .gitignore, so without this a local `npm run lint` after
    // `npm run test:e2e` reports hundreds of errors out of compiled bundles.
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    "playwright/.cache/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
