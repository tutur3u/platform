export type DevboxSetupTool = 'bun' | 'docker' | 'git' | 'node';
export type DevboxSetupPackageManager =
  | 'apt-get'
  | 'brew'
  | 'dnf'
  | 'pacman'
  | 'winget';

export interface DevboxSetupPlanInput {
  missingTools: DevboxSetupTool[];
  packageManager: DevboxSetupPackageManager;
  platform: NodeJS.Platform;
}

const PACKAGE_COMMANDS: Record<
  DevboxSetupPackageManager,
  Partial<Record<DevboxSetupTool, string[]>>
> = {
  'apt-get': {
    bun: ['bash', '-lc', 'curl -fsSL https://bun.sh/install | bash'],
    docker: ['sudo', 'apt-get', 'install', '-y', 'docker.io'],
    git: ['sudo', 'apt-get', 'install', '-y', 'git'],
    node: ['sudo', 'apt-get', 'install', '-y', 'nodejs'],
  },
  brew: {
    bun: ['brew', 'install', 'bun'],
    docker: ['brew', 'install', '--cask', 'docker'],
    git: ['brew', 'install', 'git'],
    node: ['brew', 'install', 'node'],
  },
  dnf: {
    bun: ['bash', '-lc', 'curl -fsSL https://bun.sh/install | bash'],
    docker: ['sudo', 'dnf', 'install', '-y', 'docker'],
    git: ['sudo', 'dnf', 'install', '-y', 'git'],
    node: ['sudo', 'dnf', 'install', '-y', 'nodejs'],
  },
  pacman: {
    bun: ['sudo', 'pacman', '-S', '--noconfirm', 'bun'],
    docker: ['sudo', 'pacman', '-S', '--noconfirm', 'docker'],
    git: ['sudo', 'pacman', '-S', '--noconfirm', 'git'],
    node: ['sudo', 'pacman', '-S', '--noconfirm', 'nodejs'],
  },
  winget: {
    bun: ['winget', 'install', 'Oven-sh.Bun'],
    docker: ['winget', 'install', 'Docker.DockerDesktop'],
    git: ['winget', 'install', 'Git.Git'],
    node: ['winget', 'install', 'OpenJS.NodeJS.LTS'],
  },
};

export function createDevboxSetupPlan(input: DevboxSetupPlanInput) {
  const commands = input.missingTools.flatMap((tool) => {
    const command = PACKAGE_COMMANDS[input.packageManager][tool];
    return command ? [command] : [];
  });

  return {
    commands,
    missingTools: input.missingTools,
    packageManager: input.packageManager,
    platform: input.platform,
  };
}
