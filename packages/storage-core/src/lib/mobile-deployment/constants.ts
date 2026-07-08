// Minimal copy of the mobile-deployment drive prefix needed by the storage
// reserved-path policy, kept here so @tuturuuu/storage-core stays self-contained.
// Canonical definition: apps/web/src/lib/mobile-deployment/constants.ts (and the
// Rust backend MOBILE_DEPLOYMENT_DRIVE_PREFIX) — keep these in sync.
export const MOBILE_DEPLOYMENT_DRIVE_PREFIX =
  '.tuturuuu/mobile-deployment-vault' as const;
