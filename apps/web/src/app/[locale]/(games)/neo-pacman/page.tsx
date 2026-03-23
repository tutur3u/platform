import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import { Gamepad2 } from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import { PacmanGame } from './game';

export default function NeoPacman() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_50%)] opacity-50" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(251,191,36,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(251,191,36,0.05)_1px,transparent_1px)] bg-size-[4rem_4rem]" />

      <div className="container relative z-10 flex flex-col items-center justify-center gap-12 px-4 py-16">
        {/* Header Section */}
        <div className="space-y-2 text-center">
          <h1 className="font-extrabold text-4xl leading-tight md:text-5xl lg:text-6xl">
            NEO{' '}
            <span className="relative">
              <span className="border-brand-light-yellow border-b-4 text-brand-light-blue">
                PACMAN
              </span>
              <div className="absolute -top-2 -right-2">
                <Gamepad2 className="h-5 w-5 text-brand-light-yellow md:h-6 md:w-6" />
              </div>
            </span>
          </h1>

          <p className="mx-auto max-w-3xl font-medium text-lg text-muted-foreground md:text-xl">
            Choose a map and eat all the ghosts to win!
          </p>
        </div>

        {/* Game Container */}
        <PacmanGame />

        {/* Instructions Section */}
        <Card className="max-w-3xl border-dynamic-yellow/20 bg-card/80 shadow-2xl backdrop-blur-sm">
          <CardHeader className="pb-6">
            <CardTitle className="bg-linear-to-r from-dynamic-light-yellow via-dynamic-light-orange to-dynamic-light-yellow bg-clip-text text-center font-bold text-2xl text-transparent">
              How to Play
            </CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 md:grid-cols-2">
            <Card
              className={cn(
                'group relative overflow-hidden border-dynamic-light-blue/30 bg-linear-to-br from-dynamic-blue/5 to-transparent transition-all duration-300',
                'hover:border-dynamic-light-blue/50 hover:shadow-dynamic-blue/20 hover:shadow-lg'
              )}
            >
              <CardContent className="p-4">
                <div className="mb-3 text-3xl">🕹️</div>
                <h4 className="mb-2 font-semibold text-dynamic-light-blue">
                  Movement
                </h4>
                <p className="text-muted-foreground text-sm">
                  Navigate Pacman using Arrow Keys around the maze
                </p>
              </CardContent>
            </Card>

            <Card
              className={cn(
                'group relative overflow-hidden border-dynamic-light-yellow/30 bg-linear-to-br from-dynamic-yellow/5 to-transparent transition-all duration-300',
                'hover:border-dynamic-light-yellow/50 hover:shadow-dynamic-yellow/20 hover:shadow-lg'
              )}
            >
              <CardContent className="p-4">
                <div className="mb-3 text-3xl">⚡</div>
                <h4 className="mb-2 font-semibold text-dynamic-light-yellow">
                  Power Pellets
                </h4>
                <p className="text-muted-foreground text-sm">
                  Eat large dots to turn ghosts blue and vulnerable
                </p>
              </CardContent>
            </Card>

            <Card
              className={cn(
                'group relative overflow-hidden border-dynamic-light-red/30 bg-linear-to-br from-dynamic-red/5 to-transparent transition-all duration-300',
                'hover:border-dynamic-light-red/50 hover:shadow-dynamic-red/20 hover:shadow-lg'
              )}
            >
              <CardContent className="p-4">
                <div className="mb-3 text-3xl">👻</div>
                <h4 className="mb-2 font-semibold text-dynamic-light-red">
                  Hunt Ghosts
                </h4>
                <p className="text-muted-foreground text-sm">
                  Eat frightened ghosts while they're blue after eating a power
                  pellet
                </p>
              </CardContent>
            </Card>

            <Card
              className={cn(
                'group relative overflow-hidden border-dynamic-light-purple/30 bg-linear-to-br from-dynamic-purple/5 to-transparent transition-all duration-300',
                'hover:border-dynamic-light-purple/50 hover:shadow-dynamic-purple/20 hover:shadow-lg'
              )}
            >
              <CardContent className="p-4">
                <div className="mb-3 text-3xl">🎯</div>
                <h4 className="mb-2 font-semibold text-dynamic-light-purple">
                  Strategy
                </h4>
                <p className="text-muted-foreground text-sm">
                  Each ghost has unique AI - learn their patterns!
                </p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-muted-foreground text-xs">
          <p>Built with Phaser • Inspired by the classic arcade game</p>
        </div>
      </div>
    </div>
  );
}
