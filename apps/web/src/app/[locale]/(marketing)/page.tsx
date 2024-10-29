import WhatIsNeo from './what-is-neo';

export default function MarketingPage() {
  return (
    <>
      <WhatIsNeo />
      <div className="relative flex w-full flex-col items-center px-8">
        <div className="z-20 m-8 h-screen w-full rounded-3xl bg-zinc-300/10 backdrop-blur-xl">
          <div className="z-30 mt-14 grid h-full grid-cols-7 gap-10 p-8">
            <div className="col-span-2 h-2/3 rounded-xl bg-black/20"></div>
            <div className="col-span-3 row-span-2 h-2/3 rounded-xl bg-black/20"></div>
            <div className="col-span-2 h-2/3 rounded-xl bg-black/20"></div>
            <div className="col-span-2 h-2/3 rounded-xl bg-black/20"></div>
            <div className="col-span-2 h-2/3 rounded-xl bg-black/20"></div>
          </div>
        </div>
        <div className="absolute inset-0 z-10 flex h-screen items-center justify-center">
          <div className="aspect-square h-32 w-32 rounded-full bg-[radial-gradient(circle,_rgba(217,180,48,0.8)_0%,_rgba(113,113,122,0.1)_80%)] md:h-64 md:w-64 lg:h-[36rem] lg:w-[36rem]"></div>
        </div>
        {/* <AboutUs /> */}
      </div>
    </>
  );
}
