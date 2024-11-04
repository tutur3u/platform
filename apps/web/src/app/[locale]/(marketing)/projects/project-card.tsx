import { Project } from './data';
import { Separator } from '@repo/ui/components/ui/separator';

interface ProjectCardProps {
  project: Project;
  type?: string;
  status?: string;
  onClick: () => void;
}

export default function ProjectCard({
  project,
  type,
  status,
  onClick,
}: ProjectCardProps) {
  let isHighlighted = null;
  if (type && status) {
    isHighlighted = type === project.type && status === project.status;
  } else if (type) {
    isHighlighted = type === project.type;
  } else if (status) {
    isHighlighted = status === project.status;
  }

  return (
    <button
      key={project.name}
      className="h-full w-3/4 rounded-bl-lg bg-gradient-to-br from-[#ea4c4c] via-[#34bbed] to-[#1433e2] p-[1px] transition duration-300 [clip-path:polygon(20%_0,85%_0,100%_15%,100%_85%,85%_100%,0_100%,0_20%,10%_15%)] hover:-translate-y-2 md:w-full md:max-w-80 dark:from-[#F4B71A] dark:via-white dark:to-[#1AF4E6]"
      onClick={onClick}
    >
      <div
        className={`flex h-full justify-center rounded-lg text-center [clip-path:polygon(20%_0,85%_0,100%_15%,100%_85%,85%_100%,0_100%,0_20%,10%_15%)] ${
          isHighlighted
            ? 'bg-gradient-to-br from-[#1AF4E6] via-[#212144] to-[#F4B71A]'
            : 'bg-[#c6d9e3] dark:bg-[#18182F]'
        }`}
      >
        <div className="flex w-full flex-col px-6 py-4">
          <div className="flex flex-grow flex-col">
            <div className="mx-4 rounded-lg bg-gradient-to-br from-emerald-300 via-sky-300 to-violet-300 p-[1px] [clip-path:polygon(10%_0,100%_0,100%_40%,90%_100%,0_100%,0_60%)] dark:from-[#F4B71A]/70 dark:via-[#87D580]/60 dark:to-[#1AF4E6]/50">
              <p
                className={`text-md rounded-lg p-2 font-bold [clip-path:polygon(10%_0,100%_0,100%_40%,90%_100%,0_100%,0_60%)] ${
                  isHighlighted
                    ? 'bg-gradient-to-r from-[#F4B71A] via-[#87D580] to-[#1AF4E6] text-slate-900'
                    : 'bg-emerald-200 dark:bg-[#212144]'
                }`}
              >
                {project.name}
              </p>
            </div>

            <Separator className="my-2" />

            <h2 className={`mb-2 text-lg ${isHighlighted ? 'text-white' : ''}`}>
              {project.manager}
            </h2>
            <p className={`mb-5 text-xs ${isHighlighted ? 'text-white' : ''}`}>
              {project.description}
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-brand-light-blue rounded-lg p-[1px] [clip-path:polygon(10%_0,100%_0,100%_40%,90%_100%,0_100%,0_60%)] dark:bg-[#D9D9D9]">
              <p className="rounded-lg bg-gradient-to-b from-[#F4B71A] to-[#9a7005] px-4 py-2 text-sm font-semibold text-black transition-opacity [clip-path:polygon(10%_0,100%_0,100%_40%,90%_100%,0_100%,0_60%)] hover:opacity-90 dark:from-[#1AF4E6] dark:to-black/75">
                {project.type === 'web'
                  ? 'Web Development'
                  : project.type === 'software'
                    ? 'Software'
                    : project.type === 'hardware'
                      ? 'Hardware'
                      : 'Other'}
              </p>
            </div>
            <div className="bg-brand-light-blue rounded-lg p-[1px] [clip-path:polygon(10%_0,100%_0,100%_40%,90%_100%,0_100%,0_60%)] dark:bg-[#D9D9D9]">
              <p className="rounded-lg bg-gradient-to-b from-[#F4B71A] to-[#9a7005] px-4 py-2 text-sm font-semibold text-black transition-opacity [clip-path:polygon(10%_0,100%_0,100%_40%,90%_100%,0_100%,0_60%)] hover:opacity-90 dark:from-[#1AF4E6] dark:to-black/75">
                {project.status === 'completed'
                  ? 'Completed'
                  : project.status === 'ongoing'
                    ? 'Ongoing'
                    : project.status === 'planning'
                      ? 'Planning'
                      : 'Unknown'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
