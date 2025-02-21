/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
const config = {
    "semi": true,
    "trailingComma": "es5",
    "singleQuote": true,
    "tabWidth": 2,
    "importOrderSeparation": true,
    "importOrderSortSpecifiers": true,
    "plugins": [
        "@trivago/prettier-plugin-sort-imports",
        "prettier-plugin-tailwindcss"
    ],
    "tailwindStylesheet": "./packages/ui/src/globals.css",
    "tailwindFunctions": ["clsx", "twMerge", "cn", "tw"]
};

export default config;
