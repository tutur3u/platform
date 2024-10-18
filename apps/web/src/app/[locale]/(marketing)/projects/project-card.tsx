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
  return (
    <button
      key={project.name}
      className={`flex h-full w-full items-center justify-center rounded-lg border p-2 transition duration-300 hover:-translate-y-2 ${
        project.type === 'web'
          ? 'border-blue-500/20 bg-blue-500/5 text-blue-700 hover:bg-blue-500/10 dark:border-blue-300/20 dark:bg-blue-300/5 dark:text-blue-100 dark:hover:bg-blue-300/10'
          : project.type === 'software'
            ? 'border-red-500/20 bg-red-500/5 text-red-700 hover:bg-red-500/10 dark:border-red-300/20 dark:bg-red-300/5 dark:text-red-100 dark:hover:bg-red-300/10'
            : project.type === 'hardware'
              ? 'border-pink-500/20 bg-pink-500/5 text-pink-700 hover:bg-pink-500/10 dark:border-pink-300/20 dark:bg-pink-300/5 dark:text-pink-100 dark:hover:bg-pink-300/10'
              : ''
      } ${
        (type && type !== project.type) || (status && status !== project.status)
          ? 'opacity-30'
          : ''
      }`}
      onClick={onClick}
    >
      <div className="flex h-full w-full flex-col items-center justify-center">
        <div className="text-foreground text-center font-bold">
          {project.name}
        </div>
        <div className="text-sm font-semibold leading-none">
          {project.manager}
        </div>

        <Separator
          className={`my-2 ${
            project.type === 'web'
              ? 'bg-blue-500/20 dark:bg-blue-300/20'
              : project.type === 'software'
                ? 'bg-red-500/20 dark:bg-red-300/20'
                : project.type === 'hardware'
                  ? 'bg-pink-500/20 dark:bg-pink-300/20'
                  : ''
          }`}
        />

        <div className="flex h-full items-center justify-center text-center text-xs font-semibold leading-none opacity-80">
          {project.description}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {project.techStack?.map((tech) => (
            <div
              key={tech}
              className={`rounded-full border px-2 py-0.5 text-center text-xs font-semibold ${
                project.type === 'web'
                  ? 'border-blue-500/20 bg-blue-500/10 text-blue-500 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300'
                  : project.type === 'software'
                    ? 'border-red-500/20 bg-red-500/10 text-red-500 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300'
                    : project.type === 'hardware'
                      ? 'border-pink-500/20 bg-pink-500/10 text-pink-500 dark:border-pink-300/20 dark:bg-pink-300/10 dark:text-pink-300'
                      : ''
              }`}
            >
              {tech}
            </div>
          ))}
        </div>

        <Separator
          className={`my-2 ${
            project.type === 'web'
              ? 'bg-blue-500/20 dark:bg-blue-300/20'
              : project.type === 'software'
                ? 'bg-red-500/20 dark:bg-red-300/20'
                : project.type === 'hardware'
                  ? 'bg-pink-500/20 dark:bg-pink-300/20'
                  : ''
          }`}
        />

        <div
          className={`w-full rounded border p-1 text-center text-sm font-semibold ${
            project.type === 'web'
              ? 'border-blue-500/20 bg-blue-500/10 text-blue-500 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300'
              : project.type === 'software'
                ? 'border-red-500/20 bg-red-500/10 text-red-500 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300'
                : project.type === 'hardware'
                  ? 'border-pink-500/20 bg-pink-500/10 text-pink-500 dark:border-pink-300/20 dark:bg-pink-300/10 dark:text-pink-300'
                  : ''
          }`}
        >
          {project.type === 'web'
            ? 'Web Development'
            : project.type === 'software'
              ? 'Software'
              : project.type === 'hardware'
                ? 'Hardware'
                : 'Other'}
        </div>

        <div
          className={`mt-2 w-full rounded border p-1 text-center text-sm font-semibold ${
            project.status === 'completed'
              ? 'border-green-500/20 bg-green-500/10 text-green-500 dark:border-green-300/20 dark:bg-green-300/10 dark:text-green-300'
              : project.status === 'ongoing'
                ? 'border-purple-500/20 bg-purple-500/10 text-purple-500 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300'
                : project.status === 'planning'
                  ? 'border-orange-500/20 bg-orange-500/10 text-orange-500 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300'
                  : ''
          }`}
        >
          {project.status === 'completed'
            ? 'Completed'
            : project.status === 'ongoing'
              ? 'Ongoing'
              : project.status === 'planning'
                ? 'Planning'
                : 'Unknown'}
        </div>
      </div>
    </button>
  );
}
