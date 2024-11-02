import WhatIsNeo from './what-is-neo';
import WhyUs from './why-us';

export default function MarketingPage() {
  return (
    <>
      <WhatIsNeo />
      <div className="relative mx-12 my-8">
        <div className="aspect-square rounded-3xl bg-zinc-300/10 p-8 backdrop-blur-xl md:aspect-video">
          <div className="grid h-full grid-cols-7 grid-rows-2 gap-10">
            <div className="col-span-2 h-2/3 rounded-xl bg-black/20"></div>
            <div className="col-span-3 row-span-2 h-2/3 rounded-xl bg-black/20"></div>
            <div className="col-span-2 h-2/3 rounded-xl bg-black/20"></div>
            <div className="col-span-2 h-2/3 self-end rounded-xl bg-black/20"></div>
            <div className="col-span-2 h-2/3 self-end rounded-xl bg-black/20"></div>
          </div>
        </div>
        <div className="absolute inset-0 -z-10 flex items-center justify-center">
          <div className="aspect-square h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(217,180,48,0.8)_0%,_rgba(113,113,122,0.1)_80%)] md:h-64 md:w-64 lg:h-[36rem] lg:w-[36rem]"></div>
        </div>
      </div>
      <WhyUs />
    </>
  );
}
