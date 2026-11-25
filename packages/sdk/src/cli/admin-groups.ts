import { runDomainsCommand } from './domains';
import { flagsHelp, runFlagsCommand } from './flags';
import { externalAdminHelp, isExternalHelp } from './external-admin';
import { peopleHelp, runPeopleCommand } from './people';

export { runExternalCommand } from './external-admin';

type AdminCommand = typeof runDomainsCommand;

/** Workspace admin groups that share the external-admin dispatch. */
export const adminCommands: Partial<Record<string, AdminCommand>> = {
  domains: runDomainsCommand,
  flags: runFlagsCommand,
  people: runPeopleCommand,
};

export function isAdminHelp(group?: string, action?: string) {
  return (
    group === 'people' || group === 'flags' || isExternalHelp(group, action)
  );
}

export function adminHelp(group?: string) {
  if (group === 'flags') return flagsHelp();
  return group === 'people' ? peopleHelp() : externalAdminHelp(group);
}
