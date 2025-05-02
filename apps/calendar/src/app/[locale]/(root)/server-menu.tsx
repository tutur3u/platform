import Menu from './menu';
import { getCurrentUser } from '@tuturuuu/utils/server/user-helper';

export default async function ServerMenu() {
  const user = await getCurrentUser(true);
  return <Menu user={user} />;
}
