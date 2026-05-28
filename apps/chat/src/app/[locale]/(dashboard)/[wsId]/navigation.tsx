import type { NavLink } from '@tuturuuu/ui/custom/navigation';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  personalOrWsId,
}: {
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  void personalOrWsId;

  return [];
}
