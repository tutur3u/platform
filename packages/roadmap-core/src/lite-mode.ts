/**
 * Lite mode for low-end devices.
 *
 * The boot script in <head> (src/boot/roadmap-boot.js, an external
 * same-origin asset) marks the document with `data-lite` before the first
 * paint when the device reports four or fewer cores, 4 GB or less of memory,
 * or Data Saver. The stylesheet then drops blur, blend modes, backdrop
 * filters and decorative animation (see `html[data-lite]` rules in
 * styles.css), so there is no flash of the heavy version. This module holds
 * the same decision as a pure function for tests.
 */
export const LITE_ATTRIBUTE = 'data-lite';

/** Thresholds at or below which a device gets the lite rendering. */
export const LITE_MAX_CORES = 4;
export const LITE_MAX_MEMORY_GB = 4;

type DeviceHints = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

/** Pure decision; the boot script applies the same thresholds. */
export function isLiteDevice(hints: DeviceHints): boolean {
  const cores = hints.hardwareConcurrency;
  const memory = hints.deviceMemory;
  return Boolean(
    (cores && cores <= LITE_MAX_CORES) ||
    (memory && memory <= LITE_MAX_MEMORY_GB) ||
    hints.connection?.saveData
  );
}
