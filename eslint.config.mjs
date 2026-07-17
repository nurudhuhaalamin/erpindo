// Konfigurasi ESLint flat (ESLint 9) — migrasi dari .eslintrc.json lama (Fase 12a).
// Semua aturan lama dipertahankan; job lint CI kini wajib (blocking).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    // Terjemahan .eslintignore lama
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "coverage/**",
      "**/*.min.js",
      "pnpm-lock.yaml",
      ".next/**",
      "out/**",
      "venv/**",
      "wrangler.dev.jsonc",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    settings: {
      react: { version: "19" },
    },
    rules: {
      // Paritas dengan react-hooks v4 recommended (kondisi repo saat lint dibuat wajib).
      // Aturan baru berbasis React Compiler (purity, set-state-in-effect, refs,
      // preserve-manual-memoization) sengaja belum diaktifkan — butuh perombakan
      // komponen tersendiri sebelum layak jadi gerbang.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-console": "off",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
