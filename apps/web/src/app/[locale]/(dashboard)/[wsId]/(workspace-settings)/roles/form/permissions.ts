type RolePermission = {
  id: string;
  title: string;
  description: string;
  disabled?: boolean;
};

type RolePermissionGroup = {
  title: string;
  permissions: RolePermission[];
};

export const permissionGroups = [
  {
    title: 'Workspace',
    permissions: [
      {
        title: 'Manage workspace roles',
        description:
          'Allows members to manage roles in the workspace, including role display and permissions.',
      },
      {
        title: 'Manage workspace members',
        description:
          'Allows members to add and remove members from the workspace.',
        disabled: true,
      },
      {
        title: 'Invite members',
        description: 'Allows members to invite new members to the workspace.',
        disabled: true,
      },
      {
        title: 'Manage workspace settings',
        description: 'Allows members to manage workspace settings.',
        disabled: true,
      },
      {
        title: 'Manage workspace integrations',
        description: 'Allows members to manage workspace integrations.',
        disabled: true,
      },
      {
        title: 'Manage workspace billing',
        description: 'Allows members to manage workspace billing.',
        disabled: true,
      },
      {
        title: 'Manage workspace security',
        description: 'Allows members to manage workspace security settings.',
        disabled: true,
      },
      {
        title: 'Manage workspace data',
        description: 'Allows members to manage workspace data.',
        disabled: true,
      },
      {
        title: 'Manage workspace audit logs',
        description: 'Allows members to manage workspace audit logs.',
        disabled: true,
      },
    ],
  },
  {
    title: 'AI Chat',
    permissions: [
      {
        title: 'Tuturuuu AI Chat',
        description: 'Allows members to interact with Tuturuuu AI Chat.',
        disabled: true,
      },
    ],
  },
  {
    title: 'AI Lab',
  },
  {
    title: 'Calendar',
  },
  {
    title: 'Projects',
  },
  {
    title: 'Documents',
  },
  {
    title: 'Drive',
  },
  {
    title: 'Virtual Users',
  },
  {
    title: 'Inventory',
  },
  {
    title: 'Finance',
  },
]

  .map((group, idx) => ({
    ...group,
    id: idx.toString(),
    permissions:
      group.permissions
        ?.filter((p) => p.title && p.description && p.disabled !== true)
        .map((p, idx) => ({
          ...p,
          id: idx.toString(),
        })) || [],
  }))
  .filter(
    (group) => group.title && group.permissions && group.permissions.length > 0
  ) satisfies RolePermissionGroup[];
