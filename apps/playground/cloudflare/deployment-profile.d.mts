export function deploymentProfile(
  value?: string,
  commit?: string
): {
  name: string;
  vars: { PLATFORM_BUILD_COMMIT_HASH: string };
};
