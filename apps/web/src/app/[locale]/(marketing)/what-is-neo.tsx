export default function WhatIsNeo() {
  return (
    <div className="relative z-40 mt-20 flex w-full flex-col items-center text-center">
      <p className="text-2xl font-black md:text-5xl lg:text-7xl">
        What is
        <span className="border-b-4 border-[#FBC721] text-[#5FC6E5]">
          {' '}
          NEO Culture{' '}
        </span>
        Tech?
      </p>
      <div className="h-32 lg:w-2/3">
        <p className="mt-6 text-lg font-semibold tracking-wide md:text-xl lg:mt-10 lg:text-3xl">
          Founded in 2019, we are the best club for
          <span className="text-[#5FC6E5]"> SSET students </span>
          to explore the world of technology at RMIT University.
        </p>
      </div>
      <div className="flex w-full justify-evenly gap-16 md:gap-24 lg:mt-6">
        {[
          { number: '100+', content: 'Active Members' },
          { number: '70+', content: 'Student Projects' },
          { number: '50+', content: 'Industry Partners' },
        ].map((item, index) => (
          <div key={index} className="text-center">
            <p className="text-3xl font-extrabold text-[#FBC721] lg:text-7xl">
              {item.number}
            </p>
            <p className="mt-2 text-xl lg:mt-4 lg:text-3xl">
              {item.content.split(' ').map((word, i) => (
                <span key={i} className="block">
                  {word}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
