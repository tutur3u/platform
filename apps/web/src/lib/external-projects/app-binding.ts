import type { CanonicalExternalProject } from '@tuturuuu/types';

/** Match a registered app to its linked template, not to every custom site. */
export function appTokenTargetMatchesExternalProjectBinding({
  binding,
  targetApp,
}: {
  binding: {
    canonical_project: Pick<CanonicalExternalProject, 'id' | 'adapter'> | null;
  };
  targetApp: string;
}) {
  const project = binding.canonical_project;
  if (!project || !targetApp) return false;
  return project.adapter === 'custom'
    ? project.id === targetApp
    : project.adapter === targetApp;
}
