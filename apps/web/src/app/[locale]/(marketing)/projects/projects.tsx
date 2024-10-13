'use client';

import { Project, projects } from './data';
import ProjectDetail from './project-detail';
import { Separator } from '@repo/ui/components/ui/separator';
import { useState } from 'react';

export default function Projects() {
  const [type, setType] = useState<'web' | 'software' | 'hardware' | undefined>(
    undefined
  );
  const [status, setStatus] = useState<
    'completed' | 'in-progress' | 'planning' | undefined
  >(undefined);

  const [pinnedType, setPinnedType] = useState<boolean>(false);
  const [pinnedStatus, setPinnedStatus] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [projectDetail, setProjectDetail] = useState<Project | undefined>(
    undefined
  );

  return (
    <>
      <div className="mt-8 max-w-4xl text-center">
        <div className="mb-2 text-4xl font-bold">Projects</div>
        Our club has worked on a wide-range of projects covering{' '}
        <button
          className={`font-semibold text-blue-500 underline underline-offset-2 dark:text-blue-300 ${
            type !== undefined && type !== 'web' ? 'opacity-30' : ''
          } transition duration-300`}
          onClick={() => setPinnedType((old) => !old)}
          onMouseEnter={() => {
            setPinnedType((old) => (type === 'web' ? old : false));

            setType((old) =>
              old === 'web' ? (pinnedType ? old : undefined) : 'web'
            );
          }}
          onMouseLeave={() => {
            if (!pinnedType) {
              setType((old) => (old === 'web' ? undefined : old));
            }
          }}
        >
          Web Development
        </button>
        ,{' '}
        <button
          className={`font-semibold text-red-500 underline underline-offset-2 dark:text-red-300 ${
            type !== undefined && type !== 'software' ? 'opacity-30' : ''
          } transition duration-300`}
          onClick={() => setPinnedType((old) => !old)}
          onMouseEnter={() => {
            setPinnedType((old) => (type === 'software' ? old : false));

            setType((old) =>
              old === 'software' ? (pinnedType ? old : undefined) : 'software'
            );
          }}
          onMouseLeave={() => {
            if (!pinnedType) {
              setType((old) => (old === 'software' ? undefined : old));
            }
          }}
        >
          Software
        </button>
        , and{' '}
        <button
          className={`font-semibold text-pink-500 underline underline-offset-2 dark:text-pink-300 ${
            type !== undefined && type !== 'hardware' ? 'opacity-30' : ''
          } transition duration-300`}
          onClick={() => setPinnedType((old) => !old)}
          onMouseEnter={() => {
            setPinnedType((old) => (type === 'hardware' ? old : false));

            setType((old) =>
              old === 'hardware' ? (pinnedType ? old : undefined) : 'hardware'
            );
          }}
          onMouseLeave={() => {
            if (!pinnedType) {
              setType((old) => (old === 'hardware' ? undefined : old));
            }
          }}
        >
          Hardware
        </button>
        . You can also view{' '}
        <button
          className={`font-semibold text-green-500 underline underline-offset-2 dark:text-green-300 ${
            status !== undefined && status !== 'completed' ? 'opacity-30' : ''
          } transition duration-300`}
          onClick={() => setPinnedStatus((old) => !old)}
          onMouseEnter={() => {
            setPinnedStatus((old) => (status === 'completed' ? old : false));

            setStatus((old) =>
              old === 'completed'
                ? pinnedStatus
                  ? old
                  : undefined
                : 'completed'
            );
          }}
          onMouseLeave={() => {
            if (!pinnedStatus) {
              setStatus((old) => (old === 'completed' ? undefined : old));
            }
          }}
        >
          Completed projects
        </button>
        ,{' '}
        <button
          className={`font-semibold text-purple-500 underline underline-offset-2 dark:text-purple-300 ${
            status !== undefined && status !== 'in-progress' ? 'opacity-30' : ''
          } transition duration-300`}
          onClick={() => setPinnedStatus((old) => !old)}
          onMouseEnter={() => {
            setPinnedStatus((old) => (status === 'in-progress' ? old : false));

            setStatus((old) =>
              old === 'in-progress'
                ? pinnedStatus
                  ? old
                  : undefined
                : 'in-progress'
            );
          }}
          onMouseLeave={() => {
            if (!pinnedStatus) {
              setStatus((old) => (old === 'in-progress' ? undefined : old));
            }
          }}
        >
          Ongoing projects
        </button>
        , and{' '}
        <button
          className={`font-semibold text-orange-500 underline underline-offset-2 dark:text-orange-300 ${
            status !== undefined && status !== 'planning' ? 'opacity-30' : ''
          } transition duration-300`}
          onClick={() => setPinnedStatus((old) => !old)}
          onMouseEnter={() => {
            setPinnedStatus((old) => (status === 'planning' ? old : false));

            setStatus((old) =>
              old === 'planning' ? (pinnedStatus ? old : undefined) : 'planning'
            );
          }}
          onMouseLeave={() => {
            if (!pinnedStatus) {
              setStatus((old) => (old === 'planning' ? undefined : old));
            }
          }}
        >
          Upcoming projects
        </button>{' '}
        below.
      </div>

      <div className="my-4 grid w-full gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((member) => (
          <button
            key={member.name}
            className={`flex h-full w-full items-center justify-center rounded-lg border p-2 ${
              member.type === 'web'
                ? 'border-blue-500/20 bg-blue-500/5 text-blue-700 hover:bg-blue-500/10 dark:border-blue-300/20 dark:bg-blue-300/5 dark:text-blue-100 dark:hover:bg-blue-300/10'
                : member.type === 'software'
                  ? 'border-red-500/20 bg-red-500/5 text-red-700 hover:bg-red-500/10 dark:border-red-300/20 dark:bg-red-300/5 dark:text-red-100 dark:hover:bg-red-300/10'
                  : member.type === 'hardware'
                    ? 'border-pink-500/20 bg-pink-500/5 text-pink-700 hover:bg-pink-500/10 dark:border-pink-300/20 dark:bg-pink-300/5 dark:text-pink-100 dark:hover:bg-pink-300/10'
                    : ''
            } ${
              (type !== undefined && type !== member.type) ||
              (status !== undefined && status !== member.status)
                ? 'opacity-30'
                : ''
            } transition duration-300 hover:-translate-y-2`}
            onClick={() => {
              setProjectDetail(member);
              setIsModalOpen(true);
            }}
          >
            <div className="flex h-full w-full flex-col items-center justify-center">
              <div className="text-foreground text-center font-bold">
                {member.name}
              </div>
              <div className="text-sm font-semibold leading-none">
                {member.manager}
              </div>

              <Separator
                className={`my-2 ${
                  member.type === 'web'
                    ? 'bg-blue-500/20 dark:bg-blue-300/20'
                    : member.type === 'software'
                      ? 'bg-red-500/20 dark:bg-red-300/20'
                      : member.type === 'hardware'
                        ? 'bg-pink-500/20 dark:bg-pink-300/20'
                        : ''
                }`}
              />

              <div className="flex h-full items-center justify-center text-center text-xs font-semibold leading-none opacity-80">
                {member.description}
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {member.techStack?.map((tech) => (
                  <div
                    key={tech}
                    className={`rounded-full border px-2 py-0.5 text-center text-xs font-semibold ${
                      member.type === 'web'
                        ? 'border-blue-500/20 bg-blue-500/10 text-blue-500 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300'
                        : member.type === 'software'
                          ? 'border-red-500/20 bg-red-500/10 text-red-500 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300'
                          : member.type === 'hardware'
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
                  member.type === 'web'
                    ? 'bg-blue-500/20 dark:bg-blue-300/20'
                    : member.type === 'software'
                      ? 'bg-red-500/20 dark:bg-red-300/20'
                      : member.type === 'hardware'
                        ? 'bg-pink-500/20 dark:bg-pink-300/20'
                        : ''
                }`}
              />

              <div
                className={`w-full rounded border p-1 text-center text-sm font-semibold ${
                  member.type === 'web'
                    ? 'border-blue-500/20 bg-blue-500/10 text-blue-500 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300'
                    : member.type === 'software'
                      ? 'border-red-500/20 bg-red-500/10 text-red-500 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300'
                      : member.type === 'hardware'
                        ? 'border-pink-500/20 bg-pink-500/10 text-pink-500 dark:border-pink-300/20 dark:bg-pink-300/10 dark:text-pink-300'
                        : ''
                }`}
              >
                {member.type === 'web'
                  ? 'Web Development'
                  : member.type === 'software'
                    ? 'Software'
                    : member.type === 'hardware'
                      ? 'Hardware'
                      : 'Other'}
              </div>

              <div
                className={`mt-2 w-full rounded border p-1 text-center text-sm font-semibold ${
                  member.status === 'completed'
                    ? 'border-green-500/20 bg-green-500/10 text-green-500 dark:border-green-300/20 dark:bg-green-300/10 dark:text-green-300'
                    : member.status === 'in-progress'
                      ? 'border-purple-500/20 bg-purple-500/10 text-purple-500 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300'
                      : member.status === 'planning'
                        ? 'border-orange-500/20 bg-orange-500/10 text-orange-500 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300'
                        : ''
                }`}
              >
                {member.status === 'completed'
                  ? 'Completed'
                  : member.status === 'in-progress'
                    ? 'In Progress'
                    : member.status === 'planning'
                      ? 'Planning'
                      : ''}
              </div>
            </div>
          </button>
        ))}

        {isModalOpen && (
          <ProjectDetail
            data={projectDetail}
            onClose={() => {
              setIsModalOpen(false);
            }}
          />
        )}
      </div>
    </>
  );
}
