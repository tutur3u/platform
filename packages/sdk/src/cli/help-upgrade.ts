import type { HelpTopic } from './help-format';

export const upgradeHelp: HelpTopic = {
  commands: [
    'install [version]            install a verified release side by side (default: latest)',
    'activate <version>           hand resource shims to a release, then make it current',
    'list                         show side-by-side releases (current, previous, verified)',
    'prune --keep <n>             remove old releases; never the current or previous one',
  ],
  description:
    'Upgrades the globally installed Tuturuuu CLI package with Bun. The subcommands instead keep releases side by side in ~/.tuturuuu/cli/versions/<version>, installed from the npm registry tarball after verifying its sha512 integrity. Activation runs the target release `resources setup --force` (refused until every resource owner and ticket drains), then switches ~/.tuturuuu/cli/current and the launchers in ~/.tuturuuu/cli/bin. Roll back by activating the previous version.',
  examples: [
    'ttr upgrade',
    'ttr upgrade install 0.29.0',
    'ttr upgrade activate 0.29.0',
    'ttr upgrade list --json',
    'ttr upgrade prune --keep 2',
  ],
  options: ['--json                       print machine-readable JSON'],
  usage: 'ttr upgrade [install|activate|list|prune]',
};
