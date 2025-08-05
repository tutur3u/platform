import { GameBoard } from './components/GameBoard';

export default function FarmGamePage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-dynamic-green/5 to-dynamic-blue/5 p-4">
      <div className="flex w-full max-w-7xl flex-col items-center justify-center">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mb-2 bg-gradient-to-r from-dynamic-green to-dynamic-blue bg-clip-text text-3xl font-bold text-transparent">
            🌾 Farm Game
          </div>
          <div className="text-sm text-dynamic-gray/70">
            Grow crops, manage your farm, and become a farming master!
          </div>
        </div>

        {/* Game Container */}
        <GameBoard />

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-dynamic-gray/60">
          <div className="space-x-4">
            <span>🎮 Use arrow keys or WASD to move</span>
            <span>🌱 Select tools and press SPACE to use them</span>
            <span>💧 Keep your crops watered!</span>
          </div>
        </div>
      </div>
    </div>
  );
}
