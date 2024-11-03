import Canvas from './canvas';
import Projects from './projects';

export default function MarketingPage() {
  return (
    <div className="flex justify-center">
      <div className="text-foreground container flex flex-col items-center gap-6">
        <Canvas />
        <Projects />
      </div>
    </div>
  );
}
