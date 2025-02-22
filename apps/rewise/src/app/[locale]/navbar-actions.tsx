import { LanguageWrapper } from './language-wrapper';
import { ThemeToggle } from './theme-toggle';
import { UserNavWrapper } from './user-nav-wrapper';
import { createClient } from '@tuturuuu/supabase/next/server';

export default async function NavbarActions({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const supabase = await createClient();

  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {sbUser ? (
          <>
            <UserNavWrapper hideMetadata={hideMetadata} />
          </>
        ) : (
          <>
            <LanguageWrapper />
            <ThemeToggle />
          </>
        )}
      </div>
    </div>
  );
}
