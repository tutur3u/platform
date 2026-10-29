declare const managedProjectHostnames: {
  isReservedManagedProjectHostname(value: unknown): boolean;
  isSafeManagedProjectHostname(value: unknown): boolean;
  MAX_HOSTNAME_INPUT_LENGTH: number;
  normalizeManagedProjectHostname(value: unknown): string;
  PLATFORM_HOSTNAME_ZONES: readonly string[];
  RESERVED_MANAGED_PROJECT_HOSTNAMES: readonly string[];
  SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN: RegExp;
};

export = managedProjectHostnames;
