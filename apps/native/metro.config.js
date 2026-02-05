const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Watch all files within the monorepo
config.watchFolders = [monorepoRoot];

// Let Metro know where to resolve packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Force single React instance resolution across all workspace packages
// This prevents "Invalid hook call" errors when using shared hooks
const nativeNodeModules = path.resolve(projectRoot, 'node_modules');

// Packages that must be resolved from the native app's node_modules
// to prevent duplicate instances
const singletonPackages = {
  react: path.resolve(nativeNodeModules, 'react'),
  'react-native': path.resolve(nativeNodeModules, 'react-native'),
  '@tanstack/react-query': path.resolve(
    nativeNodeModules,
    '@tanstack/react-query'
  ),
};

config.resolver.extraNodeModules = singletonPackages;

// Custom resolver to force singleton packages from any location
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Check if this is a singleton package
  if (singletonPackages[moduleName]) {
    return {
      filePath: require.resolve(moduleName, {
        paths: [nativeNodeModules],
      }),
      type: 'sourceFile',
    };
  }

  // For subpath imports like '@tanstack/react-query/build/modern/...'
  for (const pkg of Object.keys(singletonPackages)) {
    if (moduleName.startsWith(`${pkg}/`)) {
      const subpath = moduleName.slice(pkg.length);
      return {
        filePath: require.resolve(`${pkg}${subpath}`, {
          paths: [nativeNodeModules],
        }),
        type: 'sourceFile',
      };
    }
  }

  // Fall back to default resolution
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativewind(config);
