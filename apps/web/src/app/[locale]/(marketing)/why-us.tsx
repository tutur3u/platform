export default function WhyUs() {
  return (
    <div className="flex flex-col">
      <p className="mb-12 mt-3 px-10 text-4xl font-bold md:px-32 md:text-5xl lg:text-8xl">
        Why us?
      </p>
      <div className="flex flex-col justify-between gap-8 text-center md:flex-row">
        <div className="flex aspect-square flex-1 flex-col md:aspect-[3/4]">
          <div
            className="flex h-1/5 items-center justify-center rounded-t-2xl py-3"
            style={{
              background:
                'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)',
            }}
          >
            <p className="text-foreground text-xl font-semibold md:text-2xl lg:text-3xl">
              SPECIAL EVENTS
            </p>
          </div>
          <div className="text-foreground flex flex-auto items-center justify-center bg-slate-400/30 p-4 dark:bg-slate-700/50">
            <p className="text-center text-base md:text-sm lg:text-xl">
              Events organized to support you in finding career paths in
              technology, gaining deeper insights from company trips and alumni,
              and joining coding competitions.
            </p>
          </div>
          <div className="h-1/5 rounded-b-2xl bg-slate-400/30 md:[clip-path:polygon(0_0,90%_0,73%_80%,73%_100%,0_100%)] dark:bg-slate-700/50"></div>
        </div>
        <div className="flex aspect-square flex-1 flex-col md:aspect-[3/4]">
          <div
            className="flex h-1/5 items-center justify-center rounded-t-2xl py-3"
            style={{
              background:
                'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)',
            }}
          >
            <p className="text-foreground text-xl font-semibold md:text-2xl lg:text-3xl">
              NETWORKING
            </p>
          </div>
          <div className="text-foreground justify-ceter relative flex flex-auto items-center bg-slate-400/30 p-4 dark:bg-slate-700/50">
            <p className="text-base md:text-sm lg:text-xl">
              Our network is the most valuable asset for our members. We connect
              you with the right people to help you achieve your goals.
            </p>
          </div>
          <div className="relative h-1/5 rounded-b-2xl bg-slate-400/30 md:rounded-b-none dark:bg-slate-700/50">
            <div className="absolute bottom-0 left-0 hidden h-4/5 w-1/6 -translate-x-full bg-slate-400/30 [clip-path:polygon(50%_0%,100%_0,100%_100%,0_100%,0_50%)] md:block dark:bg-slate-700/50"></div>
            <div className="absolute bottom-0 right-0 hidden h-4/5 w-1/12 translate-x-full bg-slate-400/30 [clip-path:polygon(0_0,100%_30%,100%_100%,0%_100%)] md:block dark:bg-slate-700/50"></div>
          </div>
        </div>
        <div className="flex aspect-square flex-1 flex-col md:aspect-[3/4]">
          <div
            className="flex h-1/5 items-center justify-center rounded-t-2xl py-3"
            style={{
              background:
                'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)',
            }}
          >
            <p className="text-foreground text-xl font-semibold md:text-2xl lg:text-3xl">
              VISIONS
            </p>
          </div>
          <div className="text-foreground flex flex-auto items-center justify-center bg-slate-400/30 p-4 dark:bg-slate-700/50">
            <p className="text-base md:text-sm lg:text-xl">
              We create an environment not only for students from SSET students
              but also others to learn new knowledge, have fun, and expand their
              network.
            </p>
          </div>
          <div className="h-1/5 rounded-b-2xl bg-slate-400/30 md:[clip-path:polygon(0_0,100%_0,100%_100%,15%_100%,10%_100%,10%_30%)] dark:bg-slate-700/50"></div>
        </div>
      </div>
    </div>
  );
}
