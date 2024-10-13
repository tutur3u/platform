import Canvas from './canvas';
import Projects from './projects';

export default function MarketingPage() {
  return (
    <div className="flex justify-center">
      <div className="text-foreground relative flex max-w-6xl flex-col items-center px-3 pb-16">
        <Canvas />
        <Projects />
      </div>
    </div>
  );
}
