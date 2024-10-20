import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: [
        "**/node_modules/",
        "**/dist/",
        "**/.next/",
        "**/.turbo/",
        "**/coverage/",
        "**/package-lock.json",
        "**/pnpm-lock.yaml",
        "**/yarn.lock",
    ],
}, ...compat.extends(
    "@repo/eslint-config/next.js",
    "plugin:@next/next/recommended",
    "plugin:@tanstack/eslint-plugin-query/recommended",
), {
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 5,
        sourceType: "script",

        parserOptions: {
            project: true,
        },
    },

    rules: {
        "@tanstack/query/exhaustive-deps": "error",
        "@tanstack/query/no-rest-destructuring": "warn",
        "@tanstack/query/stable-query-client": "error",
    },
}];