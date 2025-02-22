import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";

const compat = new FlatCompat({
    baseDirectory: import.meta.dirname,
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
    "@tuturuuu/eslint-config/next.js",
    "plugin:@next/next/recommended",
    "plugin:@tanstack/eslint-plugin-query/recommended",
), {
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2020,
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