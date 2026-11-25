/** Encode JSON for a Fetch header while preserving Unicode on JSON.parse. */
export function serializeJsonHeader(value: object) {
  return JSON.stringify(value).replace(
    /[^\x20-\x7e]/g,
    (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}
