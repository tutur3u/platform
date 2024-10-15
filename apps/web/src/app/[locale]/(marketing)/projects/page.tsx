import Canvas from './canvas';
import Projects from './projects';

export default function MarketingPage() {
  return (
    <div className="flex justify-center">
      <div className="text-foreground relative flex max-w-6xl flex-col items-center px-3 pb-16">
        <Canvas />
        <div className="mt-28 flex flex-col items-center md:mt-72">
          <p className="text-xl tracking-wider md:text-6xl">
            NEO Culture Tech Club
          </p>
          <p className="mt-1 bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text text-3xl font-bold tracking-widest text-transparent md:mt-6 md:text-7xl">
            PROJECTS
          </p>
          <p className="mt-1 text-center text-xs font-light md:mt-4 md:text-2xl">
            The place where you can learn, grow and have <br /> fun with
            technology, by building projects.
          </p>
        </div>
        <Projects />
      </div>
    </div>
  );
}
