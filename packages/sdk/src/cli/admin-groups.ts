import { runDomainsCommand } from './domains';
import { externalAdminHelp, isExternalHelp } from './external-admin';
import { peopleHelp, runPeopleCommand } from './people';

export { runExternalCommand } from './external-admin';

type AdminCommand = typeof runDomainsCommand;

/** Workspace admin groups that share the external-admin dispatch. */
export const adminCommands: Partial<Record<string, AdminCommand>> = {
  domains: runDomainsCommand,
  people: runPeopleCommand,
};

export function isAdminHelp(group?: string, action?: string) {
  return group === 'people' || isExternalHelp(group, action);
}

export function adminHelp(group?: string) {
  return group === 'people' ? peopleHelp() : externalAdminHelp(group);
}
