# Automated PR Build System

This directory contains GitHub Actions workflows that automatically detect changes and build only the apps that need to be rebuilt.

## How It Works

### 1. **Detect Changes Workflow** (`detect-changes.yml`)
- **Trigger**: Runs on every PR that changes files in `apps/` or `packages/`
- **Purpose**: Automatically discovers which apps need to be built based on file changes
- **Method**: Uses Turbo's built-in dependency resolution to determine affected apps

### 2. **Reusable Build Workflow** (`build-app.yml`)
- **Purpose**: Provides a standardized build and deployment process for any app
- **Features**: 
  - Automatic commit checking (prevents duplicate builds)
  - Turbo caching
  - Vercel deployment
  - Environment variable handling

### 3. **App-Specific Workflows**
Each app has a simple workflow that:
- Listens for the detect-changes workflow to complete
- Checks if that specific app needs to be built
- Calls the reusable build workflow with app-specific parameters

## Benefits

✅ **Zero Manual Configuration**: Dependencies are automatically discovered from `package.json` files
✅ **Always Accurate**: No risk of forgetting to update dependency mappings
✅ **Self-Healing**: New packages and apps are automatically included
✅ **Efficient**: Only builds apps that actually need rebuilding
✅ **Maintainable**: Single source of truth for build logic
✅ **Extendable**: Adding new apps requires minimal configuration

## Adding a New App

To add a new app to the build system:

1. **Create the app workflow file** (e.g., `.github/workflows/vercel-preview-newapp.yaml`):
```yaml
name: Vercel NewApp Preview Deployment
on:
  workflow_run:
    workflows: ["Detect Changes for Apps"]
    types: [completed]
    branches-ignore: [main, production]

jobs:
  deploy-newapp:
    if: |
      github.event.workflow_run.conclusion == 'success' &&
      contains(fromJSON(github.event.workflow_run.outputs.apps), 'newapp')
    uses: ./.github/workflows/build-app.yml
    with:
      app: newapp
      app-path: apps/newapp
      build-command: vercel build --token=${{ secrets.VERCEL_TOKEN }}
      vercel-project-id: ${{ secrets.VERCEL_NEWAPP_PROJECT_ID }}
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
      TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

2. **Add the Vercel project ID secret** to your repository secrets
3. **Done!** The system will automatically detect when the app needs to be built

## Adding a New Package

To add a new internal package:

1. **Create the package** in `packages/`
2. **Add it to any app's dependencies** in their `package.json`
3. **Done!** The system will automatically rebuild all dependent apps when the package changes

## How Dependencies Are Discovered

The system automatically:

1. **Scans all `packages/*/package.json`** files to find internal packages
2. **Scans all `apps/*/package.json`** files to find apps
3. **Reads `workspace:*` dependencies** to build the dependency graph
4. **Uses Turbo's dependency resolution** to determine what would be affected by building each app
5. **Compares changed files** against the dependency graph to determine which apps need rebuilding

## Example Scenarios

### Scenario 1: Change to a package
- **File changed**: `packages/ui/src/Button.tsx`
- **System detects**: All apps that depend on `@tuturuuu/ui`
- **Result**: Only those apps are rebuilt

### Scenario 2: Change to an app
- **File changed**: `apps/nova/src/page.tsx`
- **System detects**: Only the nova app
- **Result**: Only nova is rebuilt

### Scenario 3: New dependency added
- **Developer adds**: `"@tuturuuu/newpackage": "workspace:*"` to an app
- **System automatically**: Includes the new package in dependency tracking
- **Result**: No manual configuration needed

## Troubleshooting

### Build not triggering?
- Check that the file changes are in `apps/` or `packages/`
- Verify the PR is not targeting `main` or `production` branches
- Check the detect-changes workflow output for any errors

### App not building when it should?
- Verify the app name in the workflow matches the package name in `package.json`
- Check that the app's workflow file exists and is properly configured
- Ensure the Vercel project ID secret is correctly set

### Package changes not triggering app rebuilds?
- Verify the package is listed as a dependency in the app's `package.json`
- Check that the dependency uses `workspace:*` syntax
- Ensure the package has a valid `package.json` with a `name` field
