'use client';

import { members } from '../data';
import peopleImage from './people.png';
import Image, { StaticImageData } from 'next/image';
import React, { useState } from 'react';

const initialTimelineData = [
  {
    year: '2024',
    description:
      'STRONGER TOGETHER is our core value. As a club, we strive to create a community where everyone can learn and grow together.',
  },
  {
    year: '2023',
    description:
      'We are a community fueled by the passion for technology and innovations.',
  },
  {
    year: '2022',
    description:
      'Our club is a playground for tech enthusiasts and students from the School of Science, Engineering, and Technology.',
  },
  {
    year: '2021',
    description: 'Once you have passion in technology, you are a part of us!',
  },
];

type DepartmentName =
  | 'Finance'
  | 'Technology'
  | 'Human Resources'
  | 'Marketing'
  | 'External Relations'
  | 'Executive Board';

export default function MarketingPage() {
  const [timelineData, setTimelineData] = useState(initialTimelineData);
  const [highlightedDepartment, setHighlightedDepartment] = useState<
    DepartmentName | undefined
  >(undefined);

  const departments: { name: DepartmentName; color: string }[] = [
    { name: 'Finance', color: 'text-green-500 dark:text-green-300' },
    { name: 'Technology', color: 'text-blue-500 dark:text-blue-300' },
    { name: 'Human Resources', color: 'text-purple-500 dark:text-purple-300' },
    { name: 'Marketing', color: 'text-orange-500 dark:text-orange-300' },
    { name: 'External Relations', color: 'text-red-500 dark:text-red-300' },
    { name: 'Executive Board', color: 'text-pink-500 dark:text-pink-300' },
  ];

  const handleClick = (year: string) => {
    // Find the index of the clicked year
    const clickedIndex = timelineData.findIndex((data) => data.year === year);

    // Create a new order based on the clicked year
    const newOrder = [
      ...timelineData.slice(clickedIndex),
      ...timelineData.slice(0, clickedIndex),
    ];

    setTimelineData([...newOrder]);
  };
  return (
    <>
      <div className="flex justify-center">
        <div className="text-foreground container flex flex-col items-center gap-6">
          <div
            className="mt-8 flex h-24 w-full items-center justify-center rounded-lg border-2 border-[#5FC6E5] py-2 text-center lg:h-28"
            style={{
              background: `linear-gradient(
            to right,
            #356F80 0%, #030303 20%, /* Left gradient */
            #000000 40%, #000000 60%, /* Middle black section */
            #030303 80%, #A58211 100% /* Right gradient */
          )`,
            }}
          >
            <p className="bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text p-3 text-3xl font-black tracking-normal text-transparent md:text-5xl lg:text-6xl lg:tracking-wide">
              NEO Culture Tech history
            </p>
          </div>

          <div
            className="relative m-0 rounded-lg p-0.5 [clip-path:polygon(100%_0,_100%_100%,_10%_100%,_0_90%,_0_10%,_10%_0)] md:m-8"
            style={{
              background:
                'linear-gradient(to bottom, #1AF4E6 0%, #FFFFFF 50%, #F4B71A 100%)',
            }}
          >
            <div className="pointer-events-none absolute top-60 z-10 h-full w-full rounded-lg bg-black/70 bg-gradient-to-b from-transparent to-[#0a0515] opacity-30" />

            <div className="relative rounded-lg bg-gradient-to-b from-[#100921] to-black px-3 [clip-path:polygon(100%_0,_100%_100%,_10%_100%,_0_90%,_0_10%,_10%_0)] lg:px-20">
              <div className="flex flex-col items-center justify-center gap-8 py-12 lg:gap-14 lg:pt-14">
                {timelineData.map((data) => (
                  <div
                    className="flex w-full transform cursor-pointer items-center justify-between gap-1 transition-transform duration-500 hover:scale-95 lg:gap-5"
                    key={data.year}
                    onClick={() => handleClick(data.year)}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#5FC6E5] text-center text-sm font-black text-white lg:h-28 lg:w-28 lg:text-3xl">
                      {data.year}
                    </div>
                    <p className="w-[90%] text-xs font-semibold text-white lg:text-3xl">
                      {data.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="absolute right-6 top-3 h-0.5 w-3/4 bg-[#1AF4E6] lg:right-20 lg:top-3 lg:h-1 lg:w-4/5"></div>
              <div className="absolute right-6 top-5 h-0.5 w-3/4 bg-[#1AF4E6] bg-opacity-70 lg:right-20 lg:top-6 lg:h-1 lg:w-4/5"></div>
              <div className="absolute right-6 top-7 h-0.5 w-3/4 bg-[#1AF4E6] bg-opacity-50 lg:right-20 lg:top-9 lg:h-1 lg:w-4/5"></div>
              <div className="absolute right-6 top-9 h-0.5 w-3/4 bg-[#1AF4E6] bg-opacity-30 lg:right-20 lg:top-12 lg:h-1 lg:w-4/5"></div>
              <div className="absolute right-6 top-11 h-0.5 w-3/4 bg-[#1AF4E6] bg-opacity-10 lg:right-20 lg:top-[3.75rem] lg:h-1 lg:w-4/5"></div>

              <div className="absolute right-6 top-[6rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-10 lg:right-20 lg:top-[11rem] lg:h-1 lg:w-4/5"></div>
              <div className="absolute right-6 top-[6.5rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-30 lg:right-20 lg:top-[11.75rem] lg:h-1 lg:w-4/5"></div>
              <div className="absolute right-6 top-[7rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-50 lg:right-20 lg:top-[12.5rem] lg:h-1 lg:w-4/5"></div>
              <div className="absolute right-6 top-[7.5rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-70 lg:right-20 lg:top-[13.25rem] lg:h-1 lg:w-4/5"></div>
              <div className="absolute right-6 top-[8rem] h-0.5 w-3/4 bg-[#FBC721] lg:right-20 lg:top-[14rem] lg:h-1 lg:w-4/5"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center px-2">
        <p className="mt-8 w-full bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text p-3 text-center text-3xl font-black tracking-normal text-transparent md:text-5xl lg:text-6xl lg:tracking-wide">
          The Team
        </p>
        <div className="bg-foreground/5 border-foreground/10 text-foreground relative mx-auto mb-4 mt-4 max-w-4xl rounded-lg border text-center text-base font-semibold tracking-wide md:text-xl">
          RMIT Neo Culture Tech Club mostly operates technical events,
          workshops, trainings, etc… related to technology. Our target students
          are from the house of{' '}
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
                  onMouseEnter={() => setHighlightedDepartment(department.name)}
                  onMouseLeave={() => setHighlightedDepartment(undefined)}
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
              onMouseEnter={() => setHighlightedDepartment('Executive Board')}
              onMouseLeave={() => setHighlightedDepartment(undefined)}
            >
              Executive Board
            </button>{' '}
            to oversee the operations of the club.
          </div>
        </div>
        <div className="mt-4 grid w-full grid-cols-1 gap-0 px-16 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {members.map((p, index) => (
            <div
              key={index}
              className={`flex items-center justify-center p-4 transition duration-300 ${
                highlightedDepartment &&
                !p.departments.includes(highlightedDepartment)
                  ? 'opacity-30'
                  : 'opacity-100'
              }`}
            >
              <HumanCard name={p.name} role={p.role} imageLink={peopleImage} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
interface HumanCardProps {
  name: string;
  role: string;
  imageLink: StaticImageData;
}

const HumanCard: React.FC<HumanCardProps> = ({ name, role, imageLink }) => {
  return (
    <div className="flex w-full flex-col items-center justify-center md:w-5/6">
      <div className="flex w-full items-center justify-center">
        <Image
          src={imageLink}
          alt=""
          className="w-5/6 rounded-lg object-cover md:w-2/3"
        />
      </div>
      <p className="mt-3 text-center text-xl font-black md:text-xl">{name}</p>
      <p className="mt-2 text-center text-lg font-semibold md:text-xl">
        {role}
      </p>
    </div>
  );
};
