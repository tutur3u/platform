'use client';

const timelineData = [
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

export default function History() {
  return (
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
            NEO Culture Tech History
          </p>
        </div>

        <div className="relative m-0 rounded-lg bg-gradient-to-b from-[#1AF4E6] via-white/50 to-[#F4B71A] p-0.5 [clip-path:polygon(100%_0,_100%_100%,_10%_100%,_0_90%,_0_10%,_10%_0)] md:m-8">
          <div className="pointer-events-none absolute top-60 z-10 h-full w-full rounded-lg bg-gradient-to-b from-white/70 to-[#C6D9E3] opacity-30 dark:from-black/70 dark:to-[#0A0515]" />

          <div className="relative rounded-lg bg-gradient-to-b from-[#C6D9E3] to-white px-3 ease-in-out [clip-path:polygon(100%_0,_100%_100%,_10%_100%,_0_90%,_0_10%,_10%_0)] lg:px-20 dark:from-[#100921] dark:to-black">
            <div className="flex flex-col items-center justify-center gap-8 py-12 lg:gap-14 lg:pt-14">
              {timelineData.map((data) => (
                <div
                  className="flex w-full transform cursor-pointer items-center justify-between gap-1 transition-transform duration-700 hover:scale-95 lg:gap-5"
                  key={data.year}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#5FC6E5] text-center text-sm font-black lg:h-28 lg:w-28 lg:text-3xl">
                    {data.year}
                  </div>
                  <p className="w-[90%] text-xs font-semibold lg:text-3xl">
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
  );
}
