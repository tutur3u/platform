import { Brand } from '@/components/brand';
import { PublicExplorer } from '@/components/public-explorer';
import { publicWorlds } from '@/lib/public-worlds';
export default async function Page() {
  return (
    <>
      <Brand />
      <PublicExplorer worlds={await publicWorlds()} />
    </>
  );
}
