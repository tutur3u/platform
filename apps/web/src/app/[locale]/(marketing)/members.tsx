'use client';

import { members as mbs } from './about/data';
import { useState } from 'react';

export default function Members() {
  const [department, setDepartment] = useState<
    | 'Executive Board'
    | 'External Relations'
    | 'Technology'
    | 'Marketing'
    | 'Human Resources'
    | 'Finance'
    | undefined
  >(undefined);
  const [pinned, setPinned] = useState<boolean>(false);

  return (
    <>
      <div className="max-w-4xl text-center">
        <div className="mb-2 text-4xl font-bold">The team</div>
        <div className="bg-foreground/5 border-foreground/10 text-foreground relative mx-auto mb-4 max-w-4xl rounded-lg border p-4 text-center text-lg font-semibold tracking-wide">
          RMIT Neo Culture Tech Club mostly operates technical events,
          workshops, trainings, etc… related to technology. Our target students
          are from the house of{' '}
          <span className="text-brand-light-red font-bold underline underline-offset-4">
            SSET
          </span>
          .
        </div>
        Our club has 6 core teams:{' '}
        <button
          className={`font-semibold text-green-500 underline underline-offset-2 dark:text-green-300 ${
            department !== undefined && department !== 'Finance'
              ? 'opacity-30'
              : ''
          } transition duration-300`}
          onClick={() => setPinned((old) => !old)}
          onMouseEnter={() => {
            setPinned((old) => (department === 'Finance' ? old : false));

            setDepartment((old) =>
              old === 'Finance' ? (pinned ? old : undefined) : 'Finance'
            );
          }}
          onMouseLeave={() => {
            if (!pinned) {
              setDepartment((old) => (old === 'Finance' ? undefined : old));
            }
          }}
        >
          Finance
        </button>
        ,{' '}
        <button
          className={`font-semibold text-blue-500 underline underline-offset-2 dark:text-blue-300 ${
            department !== undefined && department !== 'Technology'
              ? 'opacity-30'
              : ''
          } transition duration-300`}
          onClick={() => setPinned((old) => !old)}
          onMouseEnter={() => {
            setPinned((old) => (department === 'Technology' ? old : false));

            setDepartment((old) =>
              old === 'Technology' ? (pinned ? old : undefined) : 'Technology'
            );
          }}
          onMouseLeave={() => {
            if (!pinned) {
              setDepartment((old) => (old === 'Technology' ? undefined : old));
            }
          }}
        >
          Technology
        </button>
        ,{' '}
        <button
          className={`font-semibold text-purple-500 underline underline-offset-2 dark:text-purple-300 ${
            department !== undefined && department !== 'Human Resources'
              ? 'opacity-30'
              : ''
          } transition duration-300`}
          onClick={() => setPinned((old) => !old)}
          onMouseEnter={() => {
            setPinned((old) =>
              department === 'Human Resources' ? old : false
            );

            setDepartment((old) =>
              old === 'Human Resources'
                ? pinned
                  ? old
                  : undefined
                : 'Human Resources'
            );
          }}
          onMouseLeave={() => {
            if (!pinned) {
              setDepartment((old) =>
                old === 'Human Resources' ? undefined : old
              );
            }
          }}
        >
          Human Resources
        </button>
        ,{' '}
        <button
          className={`font-semibold text-orange-500 underline underline-offset-2 dark:text-orange-300 ${
            department !== undefined && department !== 'Marketing'
              ? 'opacity-30'
              : ''
          } transition duration-300`}
          onClick={() => setPinned((old) => !old)}
          onMouseEnter={() => {
            setPinned((old) => (department === 'Marketing' ? old : false));

            setDepartment((old) =>
              old === 'Marketing' ? (pinned ? old : undefined) : 'Marketing'
            );
          }}
          onMouseLeave={() => {
            if (!pinned) {
              setDepartment((old) => (old === 'Marketing' ? undefined : old));
            }
          }}
        >
          Marketing
        </button>
        ,{' '}
        <button
          className={`font-semibold text-red-500 underline underline-offset-2 dark:text-red-300 ${
            department !== undefined && department !== 'External Relations'
              ? 'opacity-30'
              : ''
          } transition duration-300`}
          onClick={() => setPinned((old) => !old)}
          onMouseEnter={() => {
            setPinned((old) =>
              department === 'External Relations' ? old : false
            );

            setDepartment((old) =>
              old === 'External Relations'
                ? pinned
                  ? old
                  : undefined
                : 'External Relations'
            );
          }}
          onMouseLeave={() => {
            if (!pinned) {
              setDepartment((old) =>
                old === 'External Relations' ? undefined : old
              );
            }
          }}
        >
          External Relations
        </button>
        , with a dedicated{' '}
        <button
          className={`font-semibold text-pink-500 underline underline-offset-2 dark:text-pink-300 ${
            department !== undefined && department !== 'Executive Board'
              ? 'opacity-30'
              : ''
          } transition duration-300`}
          onClick={() => setPinned((old) => !old)}
          onMouseEnter={() => {
            setPinned((old) =>
              department === 'Executive Board' ? old : false
            );

            setDepartment((old) =>
              old === 'Executive Board'
                ? pinned
                  ? old
                  : undefined
                : 'Executive Board'
            );
          }}
          onMouseLeave={() => {
            if (!pinned) {
              setDepartment((old) =>
                old === 'Executive Board' ? undefined : old
              );
            }
          }}
        >
          Executive Board
        </button>{' '}
        to oversee the operations of the club.
      </div>

      <div className="my-4 grid w-full gap-4 text-center md:grid-cols-2 lg:grid-cols-3">
        {mbs.map((member) => (
          <div
            key={member.name}
            className={`flex w-full items-center justify-center rounded-lg border p-2 ${
              member.departments.includes('Executive Board')
                ? 'border-pink-500/20 bg-pink-500/5 text-pink-700 dark:border-pink-300/20 dark:bg-pink-300/5 dark:text-pink-100'
                : member.departments.includes('Finance')
                  ? 'border-green-500/20 bg-green-500/5 text-green-700 dark:border-green-300/20 dark:bg-green-300/5 dark:text-green-100'
                  : member.departments.includes('Technology')
                    ? 'border-blue-500/20 bg-blue-500/5 text-blue-700 dark:border-blue-300/20 dark:bg-blue-300/5 dark:text-blue-100'
                    : member.departments.includes('Human Resources')
                      ? 'border-purple-500/20 bg-purple-500/5 text-purple-700 dark:border-purple-300/20 dark:bg-purple-300/5 dark:text-purple-100'
                      : member.departments.includes('Marketing')
                        ? 'border-orange-500/20 bg-orange-500/5 text-orange-700 dark:border-orange-300/20 dark:bg-orange-300/5 dark:text-orange-100'
                        : member.departments.includes('External Relations')
                          ? 'border-red-500/20 bg-red-500/5 text-red-700 dark:border-red-300/20 dark:bg-red-300/5 dark:text-red-100'
                          : ''
            } ${department !== undefined && !member.departments.includes(department) ? 'opacity-30' : ''} transition duration-300`}
          >
            <div className="flex w-full flex-col items-center justify-center">
              <div className="text-foreground text-lg font-bold">
                {member.name}
              </div>
              <div className="text-sm font-semibold leading-none">
                {member.role}
              </div>
              <div
                className={`mt-2 w-full rounded border p-1 text-center text-sm font-semibold ${
                  member.departments.includes('Executive Board')
                    ? 'border-pink-500/20 bg-pink-500/10 text-pink-500 dark:border-pink-300/20 dark:bg-pink-300/10 dark:text-pink-300'
                    : member.departments.includes('Finance')
                      ? 'border-green-500/20 bg-green-500/10 text-green-500 dark:border-green-300/20 dark:bg-green-300/10 dark:text-green-300'
                      : member.departments.includes('Technology')
                        ? 'border-blue-500/20 bg-blue-500/10 text-blue-500 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300'
                        : member.departments.includes('Human Resources')
                          ? 'border-purple-500/20 bg-purple-500/10 text-purple-500 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300'
                          : member.departments.includes('Marketing')
                            ? 'border-orange-500/20 bg-orange-500/10 text-orange-500 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300'
                            : member.departments.includes('External Relations')
                              ? 'border-red-500/20 bg-red-500/10 text-red-500 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300'
                              : ''
                }`}
              >
                {member.departments[0]}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
