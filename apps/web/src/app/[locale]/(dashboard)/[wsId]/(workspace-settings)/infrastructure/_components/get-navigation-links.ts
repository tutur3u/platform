import { WorkspaceNavigationLinks } from '../../../navigation';

export async function getInfrastructureNavigationLinks({
  wsId,
  personalOrWsId,
  isPersonal,
  isTuturuuuUser,
}: {
  wsId: string;
  personalOrWsId: string;
  isPersonal: boolean;
  isTuturuuuUser: boolean;
}) {
  const navLinks = await WorkspaceNavigationLinks({
    wsId,
    personalOrWsId,
    isPersonal,
    isTuturuuuUser,
  });

  // Find the infrastructure section
  const infrastructureSection = navLinks
    .flat()
    .find((link) => link?.href?.includes('/infrastructure'));

  // Return the children of the infrastructure section
  return infrastructureSection?.children || [];
}
