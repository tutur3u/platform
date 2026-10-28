export type WorkspaceRolePayload = {
  name: string;
  permissions: Array<{
    enabled: boolean;
    id: string;
  }>;
};
