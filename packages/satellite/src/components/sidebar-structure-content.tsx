'use client';
import { Nav } from '@tuturuuu/ui/custom/nav';
import {
  SatelliteContent,
  type SatelliteContentProps,
} from '@tuturuuu/ui/custom/satellite-content';
export function SidebarStructureContent(
  props: Omit<SatelliteContentProps, 'Navigation'>
) {
  return <SatelliteContent {...props} Navigation={Nav} />;
}
