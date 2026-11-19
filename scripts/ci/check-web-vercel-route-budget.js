const { readFileSync } = require('node:fs');

const maxRoutes = 1948;
const outputPath = process.argv[2] ?? '.vercel/output/config.json';
const { routes } = JSON.parse(readFileSync(outputPath, 'utf8'));

if (!Array.isArray(routes) || routes.length === 0) {
  throw new Error(`Missing Vercel output routes in ${outputPath}`);
}

console.log(
  `Web Vercel output routes: ${routes.length} (budget: ${maxRoutes}, Vercel limit: 2048)`
);
if (routes.length > maxRoutes) process.exitCode = 1;
