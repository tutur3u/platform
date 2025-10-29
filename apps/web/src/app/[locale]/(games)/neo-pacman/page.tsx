import { PacmanGame } from './game';

export default function NeoPacman() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_50%)] opacity-50" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(251,191,36,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(251,191,36,0.05)_1px,transparent_1px)] bg-size-[4rem_4rem]" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-12 p-4 py-12">
        {/* Header Section */}
        <div className="text-center">
          <div className="mb-6 inline-block">
            <h1 className="animate-pulse bg-linear-to-r from-yellow-300 via-yellow-400 to-yellow-500 bg-clip-text font-serif text-7xl font-black tracking-wider text-transparent drop-shadow-[0_0_30px_rgba(251,191,36,0.5)] md:text-8xl">
              NEO PACMAN
            </h1>
            <div className="mt-2 h-1 w-full bg-linear-to-r from-transparent via-yellow-400 to-transparent" />
          </div>

          <div className="mx-auto max-w-md space-y-3">
            <p className="text-xl font-semibold text-blue-200">
              Choose a map and eat all the ghosts to win!
            </p>
            <div className="flex items-center justify-center gap-2 rounded-full border border-yellow-500/30 bg-black/30 px-6 py-3 backdrop-blur-sm">
              <kbd className="rounded bg-gray-800 px-2 py-1 text-xs font-bold text-yellow-400">
                ← ↑ ↓ →
              </kbd>
              <span className="text-sm text-gray-300">to move</span>
            </div>
          </div>
        </div>

        {/* Game Container */}
        <PacmanGame />

        {/* Instructions Section */}
        <div className="max-w-3xl rounded-2xl border border-yellow-500/20 bg-black/40 p-8 shadow-2xl backdrop-blur-sm">
          <h3 className="mb-6 bg-linear-to-r from-yellow-300 to-yellow-500 bg-clip-text text-center text-2xl font-bold text-transparent">
            How to Play
          </h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="group rounded-xl border border-blue-500/20 bg-linear-to-br from-blue-950/50 to-transparent p-4 transition-all hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/20">
              <div className="mb-2 text-3xl">🕹️</div>
              <h4 className="mb-1 font-semibold text-blue-200">Movement</h4>
              <p className="text-sm text-gray-400">
                Navigate Pacman using Arrow Keys around the maze
              </p>
            </div>

            <div className="group rounded-xl border border-yellow-500/20 bg-linear-to-br from-yellow-950/50 to-transparent p-4 transition-all hover:border-yellow-500/40 hover:shadow-lg hover:shadow-yellow-500/20">
              <div className="mb-2 text-3xl">⚡</div>
              <h4 className="mb-1 font-semibold text-yellow-200">
                Power Pellets
              </h4>
              <p className="text-sm text-gray-400">
                Eat large dots to turn ghosts blue and vulnerable
              </p>
            </div>

            <div className="group rounded-xl border border-red-500/20 bg-linear-to-br from-red-950/50 to-transparent p-4 transition-all hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/20">
              <div className="mb-2 text-3xl">👻</div>
              <h4 className="mb-1 font-semibold text-red-200">Hunt Ghosts</h4>
              <p className="text-sm text-gray-400">
                Eat all 4 ghosts while they're blue to win the game
              </p>
            </div>

            <div className="group rounded-xl border border-purple-500/20 bg-linear-to-br from-purple-950/50 to-transparent p-4 transition-all hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/20">
              <div className="mb-2 text-3xl">🎯</div>
              <h4 className="mb-1 font-semibold text-purple-200">Strategy</h4>
              <p className="text-sm text-gray-400">
                Each ghost has unique AI - learn their patterns!
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-green-500/20 bg-linear-to-br from-green-950/30 to-transparent p-4">
            <div className="flex items-center gap-2 text-green-300">
              <span className="text-xl">💡</span>
              <p className="text-sm">
                <span className="font-semibold">Pro Tip:</span> Food regenerates
                on empty tiles after 1 minute. Collect pellets for points and
                avoid ghosts in chase mode!
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500">
          <p>Built with Phaser • Inspired by the classic arcade game</p>
        </div>
      </div>
    </div>
  );
}
