import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Sprout } from '@tuturuuu/icons';
import {
  getBackendCurrentUserProfile,
  InternalApiError,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { GameBoard } from '../../../components/games/farm/game-board';
import { withTanstackBackendRuntime } from '../../../lib/cloudflare/backend';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';

const checkFarmAccess = createServerFn({ method: 'GET' }).handler(
  async (): Promise<boolean> => {
    try {
      const backendRuntime = await withTanstackBackendRuntime();
      const profile = await getBackendCurrentUserProfile(
        withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
      );

      return isValidTuturuuuEmail(profile.email);
    } catch (error) {
      if (
        error instanceof InternalApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        return false;
      }

      throw error;
    }
  }
);

export const Route = createFileRoute('/$locale/games/farm')({
  component: FarmGameRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Explore the Farm game on Tuturuuu.',
      locale,
      title: 'Farm',
    });
  },
  loader: async () => {
    if (!(await checkFarmAccess())) {
      throw notFound();
    }

    return null;
  },
});

function FarmGameRoutePage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-linear-to-br from-dynamic-green/5 to-dynamic-blue/5 p-4">
      <div className="flex w-full max-w-7xl flex-col items-center justify-center">
        <header className="mb-6 text-center">
          <div className="mb-2 flex items-center justify-center gap-2 bg-linear-to-r from-dynamic-green to-dynamic-blue bg-clip-text font-bold text-3xl text-transparent">
            <Sprout aria-hidden="true" className="h-8 w-8 text-dynamic-green" />
            <span>Farm Game</span>
          </div>
          <p className="text-dynamic-gray/70 text-sm">
            Grow crops, manage your farm, and become a farming master.
          </p>
        </header>
        <GameBoard />
        <footer className="mt-6 text-center text-dynamic-gray/60 text-xs">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <span>Use arrow keys or WASD to move</span>
            <span>Select tools and press Space to use them</span>
            <span>Keep your crops watered</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
