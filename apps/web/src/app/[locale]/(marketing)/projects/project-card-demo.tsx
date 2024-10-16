import { Project } from './data';
import { Separator } from '@repo/ui/components/ui/separator';

interface ProjectCardDemoProps {
  project: Project;
  type?: string;
  status?: string;
  onClick: () => void;
}

export default function ProjectCardDemo({
  project,
  type,
  status,
  onClick,
}: ProjectCardDemoProps) {
  console.log(project, type, status, onClick);
  return (
    <button className="text-card-foreground flex items-center justify-center border-2">
      <div className="relative w-80 overflow-hidden [clip-path:polygon(10%_0%,90%_0%,100%_15%,100%_85%,90%_100%,10%_100%,0%_85%,0%_15%)]">
        <div className="z-10 flex h-full flex-col p-6">
          <div className="jusity-center flex flex-col">
            <p className="mb-4 text-center text-2xl font-bold">Neo Checker</p>
            <Separator className="my-2" />
            <h2 className="mb-2 text-center text-xl">Vo Hoang Phuc</h2>
            <p className="mb-5 text-center text-base text-gray-400">
              The first stable release of Neo Crush With new features and
              improvements.
            </p>
          </div>

          <div className="space-y-4">
            <div className="w-full rounded-lg bg-gradient-to-b from-[#1AF4E6] to-white/25 px-4 py-2 text-center font-semibold transition-opacity hover:opacity-90">
              Web Development
            </div>
            <div className="w-full rounded-lg bg-gradient-to-b from-[#1AF4E6] to-white/25 px-4 py-2 text-center font-semibold transition-opacity hover:opacity-90">
              In progress
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
