'use client';

interface NativeInfrastructurePanelProps {
  activeTab: string;
  wsId: string;
}

export const INFRASTRUCTURE_NATIVE_TABS = new Set<string>();

export function InfrastructureNativeSettingsPanels({
  activeTab: _activeTab,
  wsId: _wsId,
}: NativeInfrastructurePanelProps) {
  return null;
}
