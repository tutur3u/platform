export default function WhyUs() {
  return (
    <div className="flex flex-col">
      <p className="mb-12 mt-3 px-10 text-3xl font-bold md:px-32 md:text-5xl lg:text-8xl">
        Why us?
      </p>
      <div className="flex flex-col justify-center gap-8 px-14 text-center md:flex-row">
        <div className="flex aspect-square flex-col md:aspect-[3/4]">
          <div
            className="flex h-1/6 items-center justify-center rounded-t-2xl py-3"
            style={{
              background:
                'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)',
            }}
          >
            <p className="text-3xl font-semibold text-white md:text-2xl">
              Special Event
            </p>
          </div>
          <div className="flex-auto bg-gray-700 p-4 text-white md:[clip-path:polygon(0_0,0_100%,70%_100%,70%_90%,78%_90%,91%_73%,100%_73%,100%_0)]">
            <div className="text-md">
              Events organized to support you in finding career paths in
              technology, gaining deeper insights from company trips and alumni,
              and joining coding competitions.
            </div>
          </div>
        </div>
        <div className="flex aspect-square flex-col md:aspect-[3/4]">
          <div
            className="flex h-1/6 items-center justify-center rounded-t-2xl py-3"
            style={{
              background:
                'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)',
            }}
          >
            <p className="text-3xl font-semibold text-white md:text-2xl">
              Special Event
            </p>
          </div>
          <div className="relative flex-auto bg-gray-700 p-4 text-white">
            <div className="text-md">
              Events organized to support you find career paths in technology,
              gain deeper insights from company trips and alumni, and join
              coding competitions.
            </div>
            <div className="absolute -left-[60px] bottom-0 hidden aspect-square w-full bg-gray-700 [clip-path:polygon(30%_75%,10%_75%,0_90%,0_100%,30%_100%)] md:block"></div>
            <div className="absolute -right-[48px] bottom-0 hidden aspect-square w-full bg-gray-700 [clip-path:polygon(78%_75%,78%_100%,100%_100%,100%_88%)] md:block"></div>
          </div>
        </div>
        <div className="flex aspect-square flex-col md:aspect-[3/4]">
          <div
            className="flex h-1/6 items-center justify-center rounded-t-2xl py-3"
            style={{
              background:
                'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)',
            }}
          >
            <p className="text-3xl font-semibold text-white md:text-2xl">
              Special Event
            </p>
          </div>
          <div className="flex-auto bg-gray-700 p-4 text-white md:[clip-path:polygon(0_0,_0_77%,_15%_85%,_15%_100%,_100%_100%,_100%_0)]">
            <div className="text-md">
              Events organized to support you find career paths in technology,
              gain deeper insights from company trips and alumni, and join
              coding competitions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
