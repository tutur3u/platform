import { GameBoard } from './components/GameBoard';

export default function FarmGamePage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <div className="flex flex-col items-center justify-center">
        <div className="mb-6 text-2xl font-bold">Farm Game</div>
        <GameBoard />
      </div>
    </div>
  );
}
