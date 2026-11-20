const { appendFileSync, readFileSync } = require('node:fs');

const maxRoutes = 1948;
const warningRoutes = 1900;
const platformLimit = 2048;
const outputPath = process.argv[2] ?? '.vercel/output/config.json';
const { routes } = JSON.parse(readFileSync(outputPath, 'utf8'));

if (!Array.isArray(routes) || routes.length === 0) {
  throw new Error(`Missing Vercel output routes in ${outputPath}`);
}

console.log(
  `Web Vercel output routes: ${routes.length} (budget: ${maxRoutes}, Vercel limit: ${platformLimit})`
);
const headroom = platformLimit - routes.length;
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Web Vercel routing rules\n\n| Commit | Routes | Headroom |\n| --- | ---: | ---: |\n| \`${process.env.GITHUB_SHA}\` | ${routes.length} | ${headroom} |\n`
  );
}
if (routes.length >= warningRoutes) {
  console.log(
    `::warning::Web Vercel output has ${routes.length} routing rules and ${headroom} rules of headroom`
  );
}
if (routes.length > maxRoutes) process.exitCode = 1;
