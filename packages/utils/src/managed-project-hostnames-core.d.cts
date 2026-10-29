declare const managedProjectHostnames: {
  isReservedManagedProjectHostname(value: unknown): boolean;
  normalizeManagedProjectHostname(value: unknown): string;
  PLATFORM_HOSTNAME_ZONES: readonly string[];
  RESERVED_MANAGED_PROJECT_HOSTNAMES: readonly string[];
};

export = managedProjectHostnames;
