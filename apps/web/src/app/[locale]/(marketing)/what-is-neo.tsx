export default function WhatIsNeo() {
  return (
    <div className="relative z-40 flex min-h-[50vh] w-full flex-col items-center justify-center px-14 text-center md:min-h-screen">
      <p className="text-4xl font-extrabold md:text-5xl lg:text-6xl">
        What is
        <span className="border-b-4 border-[#FBC721] text-[#5FC6E5]">
          {' '}
          NEO Culture{' '}
        </span>
        Tech?
      </p>
      <div className="mb-2 lg:w-2/3">
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

      <div className="absolute left-0 top-0 -z-50 aspect-[1/2] w-1/3 sm:w-1/4 md:w-1/5 lg:w-1/6">
        <svg
          className="h-full w-full"
          viewBox="0 0 255 491"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="129"
            cy="31"
            r="26"
            strokeWidth="10"
            className="stroke-foreground/50"
          />
          <circle
            cx="54"
            cy="285"
            r="49"
            className="stroke-foreground/50"
            strokeWidth="10"
          />
          <circle
            cx="221"
            cy="457"
            r="29"
            className="stroke-foreground/50"
            strokeWidth="10"
          />
          <rect
            x="120.747"
            y="57"
            width="5"
            height="190.09"
            transform="rotate(16.4241 120.747 57)"
            className="fill-foreground/50"
          />
          <rect
            x="81.8484"
            y="323.221"
            width="5"
            height="162.89"
            transform="rotate(-44.9846 81.8484 323.221)"
            className="fill-foreground/50"
          />
        </svg>
      </div>

      <div className="absolute bottom-0 right-0 -z-50 aspect-[1/2] w-1/3 sm:w-1/4 md:w-1/5 lg:w-1/6">
        <svg
          className="h-full w-full"
          viewBox="0 0 259 760"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="33.6159"
            cy="726.056"
            r="26"
            className="stroke-foreground/50"
            strokeWidth="10"
          />
          <circle
            cx="195.015"
            cy="516.077"
            r="49"
            className="stroke-foreground/50"
            strokeWidth="10"
          />
          <circle
            cx="183.185"
            cy="44.1847"
            r="34.1746"
            className="stroke-foreground/50"
            strokeWidth="10"
          />
          <circle
            cx="101.118"
            cy="295.495"
            r="29"
            className="stroke-foreground/50"
            strokeWidth="10"
          />
          <rect
            x="50.6743"
            y="704.77"
            width="5"
            height="190.09"
            transform="rotate(-142.479 50.6743 704.77)"
            className="fill-foreground/50"
          />
          <rect
            x="112.711"
            y="268.638"
            width="5"
            height="197.245"
            transform="rotate(-161.276 112.711 268.638)"
            className="fill-foreground/50"
          />
          <rect
            x="182.79"
            y="470.393"
            width="5"
            height="162.89"
            transform="rotate(156.112 182.79 470.393)"
            className="fill-foreground/50"
          />
        </svg>
      </div>
    </div>
  );
}
