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
    <button className="max-w-80 rounded-bl-lg bg-slate-800 [clip-path:polygon(20%_0,85%_0,100%_15%,100%_85%,85%_100%,0_100%,0_20%,10%_15%)]">
      <div className="flex items-center justify-center">
        <div className="flex h-full flex-col px-6 py-4">
          <div className="jusity-center flex flex-col">
            <div className="mx-4 rounded-lg bg-blue-500/5 p-2 [clip-path:polygon(10%_0,100%_0,100%_40%,90%_100%,0_100%,0_60%)]">
              <p className="text-center text-lg font-bold">Neo Checker</p>
            </div>
            <Separator className="my-2" />
            <h2 className="mb-2 text-center text-xl">Vo Hoang Phuc</h2>
            <p className="mb-5 text-center text-base text-gray-400">
              The first stable release of Neo Crush With new features and
              improvements.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg bg-gradient-to-b from-[#1AF4E6] to-white/25 px-4 py-2 text-center font-semibold transition-opacity [clip-path:polygon(10%_0,100%_0,100%_40%,90%_100%,0_100%,0_60%)] hover:opacity-90">
              Web Development
            </div>
            <div className="rounded-lg bg-gradient-to-b from-[#1AF4E6] to-white/25 px-4 py-2 text-center font-semibold transition-opacity [clip-path:polygon(10%_0,100%_0,100%_40%,90%_100%,0_100%,0_60%)] hover:opacity-90">
              In progress
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
