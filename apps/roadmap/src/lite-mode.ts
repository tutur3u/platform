/**
 * Lite mode for low-end devices.
 *
 * A tiny inline script in <head> marks the document with `data-lite` before
 * the first paint when the device reports four or fewer cores, 4 GB or less
 * of memory, or Data Saver. The stylesheet then drops blur, blend modes,
 * backdrop filters and decorative animation (see `html[data-lite]` rules in
 * styles.css), so there is no flash of the heavy version. The Worker hashes
 * this inline script into the CSP like every other inline script.
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

/** Pure decision, shared by the inline script and the tests. */
export function isLiteDevice(hints: DeviceHints): boolean {
  const cores = hints.hardwareConcurrency;
  const memory = hints.deviceMemory;
  return Boolean(
    (cores && cores <= LITE_MAX_CORES) ||
    (memory && memory <= LITE_MAX_MEMORY_GB) ||
    hints.connection?.saveData
  );
}

/** The inline script body: `isLiteDevice` applied to `navigator`. */
export const LITE_MODE_SOURCE = `try{var n=navigator,c=n.hardwareConcurrency,m=n.deviceMemory;if((c&&c<=${LITE_MAX_CORES})||(m&&m<=${LITE_MAX_MEMORY_GB})||(n.connection&&n.connection.saveData))document.documentElement.setAttribute('${LITE_ATTRIBUTE}','')}catch(e){}`;

/** Head script entry, rendered before the stylesheet applies to the body. */
export function liteModeScript() {
  return { children: LITE_MODE_SOURCE };
}
