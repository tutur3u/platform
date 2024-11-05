'use client';

import { members } from './data';
import MemberCard from './member-card';
import { useState } from 'react';

type DepartmentName =
  | 'Finance'
  | 'Technology'
  | 'Human Resources'
  | 'Marketing'
  | 'External Relations'
  | 'Executive Board';

const departments: { name: DepartmentName; color: string }[] = [
  { name: 'Finance', color: 'text-green-500 dark:text-green-300' },
  { name: 'Technology', color: 'text-blue-500 dark:text-blue-300' },
  { name: 'Human Resources', color: 'text-purple-500 dark:text-purple-300' },
  { name: 'Marketing', color: 'text-orange-500 dark:text-orange-300' },
  { name: 'External Relations', color: 'text-red-500 dark:text-red-300' },
  { name: 'Executive Board', color: 'text-pink-500 dark:text-pink-300' },
];

export default function Members() {
  const [highlightedDepartment, setHighlightedDepartment] = useState<
    DepartmentName | undefined
  >(undefined);

  const [pinState, setPinState] = useState<boolean>(false);

  return (
    <div className="flex flex-col items-center px-2">
      <p className="mt-8 w-full bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text p-3 text-center text-3xl font-black tracking-normal text-transparent md:text-5xl lg:text-6xl lg:tracking-wide">
        The Team
      </p>
      <div className="bg-foreground/5 border-foreground/10 text-foreground relative mx-auto mb-4 mt-4 max-w-4xl rounded-lg border p-2 text-center text-base font-semibold tracking-wide md:p-6 md:text-xl">
        RMIT Neo Culture Tech Club mostly operates technical events, workshops,
        trainings, etc… related to technology. Our target students are from the
        house of{' '}
        <span className="text-brand-light-red font-bold underline underline-offset-4">
          SSET
        </span>
        .
      </div>

      <div className="my-4">
        <div className="w-full px-2 text-center text-base font-semibold md:px-40 md:text-lg">
          Our club has 6 core teams:{' '}
          {departments.map((department, index) => (
            <span key={department.name}>
              <button
                className={`font-semibold underline underline-offset-2 transition duration-300 ${department.color} ${
                  highlightedDepartment !== undefined &&
                  highlightedDepartment !== department.name
                    ? 'opacity-30'
                    : ''
                }`}
                onMouseEnter={() => {
                  if (!pinState) setHighlightedDepartment(department.name);
                }}
                onMouseLeave={() => {
                  if (!pinState) setHighlightedDepartment(undefined);
                }}
                onClick={() => setPinState(!pinState)}
              >
                {department.name}
              </button>
              {index < departments.length - 1 && ', '}
            </span>
          ))}
          , with a dedicated{' '}
          <button
            className={`font-semibold text-pink-500 underline underline-offset-2 dark:text-pink-300 ${
              highlightedDepartment !== undefined &&
              highlightedDepartment !== 'Executive Board'
                ? 'opacity-30'
                : ''
            }`}
            onMouseEnter={() => {
              if (!pinState) setHighlightedDepartment('Executive Board');
            }}
            onMouseLeave={() => {
              if (!pinState) setHighlightedDepartment(undefined);
            }}
            onClick={() => setPinState(!pinState)}
          >
            Executive Board
          </button>{' '}
          to oversee the operations of the club.
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-0 px-16 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
        {members.map((p, index) => (
          <div
            key={index}
            className={`flex justify-center p-4 transition duration-300 ${
              highlightedDepartment &&
              !p.departments.includes(highlightedDepartment)
                ? 'opacity-30'
                : 'opacity-100'
            }`}
          >
            <MemberCard name={p.name} role={p.role} image={p.image} />
          </div>
        ))}
      </div>
    </div>
  );
}
