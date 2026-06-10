#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const IOS_PROJECT_PATH = path.join(
  ROOT_DIR,
  'apps/mobile/ios/Runner.xcodeproj/project.pbxproj'
);
const EXPECTED_IOS_DEPLOYMENT_TARGET =
  '$(RECOMMENDED_IPHONEOS_DEPLOYMENT_TARGET)';
const FORBIDDEN_BUILD_SETTINGS = [
  'ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES',
  'EMBEDDED_CONTENT_CONTAINS_SWIFT',
];

function collectMobileIosProjectIssues({
  projectText,
  expectedDeploymentTarget = EXPECTED_IOS_DEPLOYMENT_TARGET,
  forbiddenBuildSettings = FORBIDDEN_BUILD_SETTINGS,
}) {
  const issues = [];

  for (const setting of forbiddenBuildSettings) {
    const settingPattern = new RegExp(`\\b${setting}\\s*=`);
    if (settingPattern.test(projectText)) {
      issues.push(
        `apps/mobile/ios/Runner.xcodeproj/project.pbxproj must not set ${setting}; Xcode recommends removing the explicit Swift standard library embedding settings.`
      );
    }
  }

  const deploymentTargetPattern =
    /IPHONEOS_DEPLOYMENT_TARGET\s*=\s*(?:"([^"]+)"|([^;]+));/g;
  const deploymentTargets = Array.from(
    projectText.matchAll(deploymentTargetPattern),
    (match) => (match[1] ?? match[2] ?? '').trim()
  );

  if (deploymentTargets.length === 0) {
    issues.push(
      'apps/mobile/ios/Runner.xcodeproj/project.pbxproj must declare IPHONEOS_DEPLOYMENT_TARGET for the Runner project and target configurations.'
    );
  }

  for (const deploymentTarget of deploymentTargets) {
    if (deploymentTarget !== expectedDeploymentTarget) {
      issues.push(
        `apps/mobile/ios/Runner.xcodeproj/project.pbxproj must use ${expectedDeploymentTarget} for IPHONEOS_DEPLOYMENT_TARGET. Found: ${deploymentTarget}.`
      );
    }
  }

  return issues;
}

function main() {
  const projectText = fs.readFileSync(IOS_PROJECT_PATH, 'utf8');
  const issues = collectMobileIosProjectIssues({ projectText });

  if (issues.length > 0) {
    console.error('Mobile iOS project settings check failed:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log('Mobile iOS project settings checks passed.');
}

if (require.main === module) {
  main();
}

module.exports = {
  EXPECTED_IOS_DEPLOYMENT_TARGET,
  FORBIDDEN_BUILD_SETTINGS,
  collectMobileIosProjectIssues,
};
