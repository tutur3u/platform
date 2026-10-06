import type { Database } from './supabase';

type DesktopTable = Database['private']['Tables'];
export type DesktopDeploymentEnvironmentRecord =
  DesktopTable['desktop_deployment_environments']['Row'];
export type DesktopDeploymentVersionRecord =
  DesktopTable['desktop_deployment_versions']['Row'];
export type DesktopDeploymentResourceRecord =
  DesktopTable['desktop_deployment_resources']['Row'];
export type DesktopDeploymentCiTokenRecord =
  DesktopTable['desktop_deployment_ci_tokens']['Row'];
export type DesktopDeploymentFetchLeaseRecord =
  DesktopTable['desktop_deployment_fetch_leases']['Row'];
