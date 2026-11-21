import {
  type FleetDigestSection,
  fleetStoredDigestSectionSchema,
  summarizeFleetDigest,
} from '@tuturuuu/internal-api/fleet';

// Drop a stored section that no longer matches the schema instead of failing
// the whole digest. Never log the section, which may contain labels.
export function summarizeStoredFleetDigest(data: unknown[]) {
  const sections: FleetDigestSection[] = [];
  for (const item of data) {
    const section = fleetStoredDigestSectionSchema.safeParse(item);
    if (section.success) {
      sections.push(section.data);
    } else {
      console.error('Invalid stored Fleet digest section');
    }
  }
  return summarizeFleetDigest(sections);
}
