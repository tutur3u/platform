'use client';

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
      'Our club has come together to create not only a playground for tech enthusiasts, but also for other students from The School of Science, Engineering, and Technology.',
  },
  {
    year: '2021',
    description: 'Once you have passion in technology, you are a part of us!',
  },
];

export default function MarketingPage() {
  const [timelineData, setTimelineData] = useState(initialTimelineData);

  // const handleClick = (year) => {
  //   // Move the clicked year to the front of the array
  //   const newOrder = timelineData.sort((a) => (a.year === year ? -1 : 1));
  //   setTimelineData([...newOrder]);
  // };
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
    <div className="min-h-screen px-10 pt-10 lg:px-16">
      <div
        className="flex h-24 items-center justify-center rounded-lg border-2 border-[#5FC6E5] py-2 text-center lg:h-28"
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
        className="relative m-8 rounded-lg p-0.5 [clip-path:polygon(100%_0,_100%_100%,_10%_100%,_0_90%,_0_10%,_10%_0)]"
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
                // className="flex w-full items-center justify-between gap-1 lg:gap-5"
                className="flex w-full transform cursor-pointer items-center justify-between gap-1 transition-transform duration-500 hover:scale-95 lg:gap-5"
                key={data.year}
                onClick={() => handleClick(data.year)}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#5FC6E5] text-center text-base font-black text-white lg:h-28 lg:w-28 lg:text-3xl">
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

          <div className="absolute right-6 top-[7rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-10 lg:right-20 lg:top-[11rem] lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-[7.5rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-30 lg:right-20 lg:top-[11.75rem] lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-[8rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-50 lg:right-20 lg:top-[12.5rem] lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-[8.5rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-70 lg:right-20 lg:top-[13.25rem] lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-[9rem] h-0.5 w-3/4 bg-[#FBC721] lg:right-20 lg:top-[14rem] lg:h-1 lg:w-4/5"></div>
        </div>
      </div>
    </div>
  );
}
