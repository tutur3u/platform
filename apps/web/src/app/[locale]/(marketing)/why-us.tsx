export default function WhyUs() {
  return (
    <div className="flex h-screen w-full flex-col items-start justify-center">
      <p className="mb-12 mt-3 px-0 text-left text-2xl font-bold md:px-32 md:text-5xl lg:text-8xl">
        Why us?
      </p>
      <div className="flex h-full w-full justify-center gap-8 px-14 text-center">
        <div className="h-2/3 w-2/5">
          <div className="relative h-full rounded-t-2xl bg-gray-700 p-4 text-white [clip-path:polygon(0_0,0_100%,76%_100%,76%_93%,83%_93%,95%_80%,100%_80%,100%_0)]">
            <div
              className="absolute inset-0 flex h-1/6 items-center justify-center rounded-t-2xl py-3"
              style={{
                background:
                  'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)',
              }}
            >
              <p className="text-2xl font-semibold text-white">Special Event</p>
            </div>
          </div>
        </div>
        <div className="h-2/3 w-2/5">
          <div className="relative h-full rounded-t-2xl bg-gray-700 p-4 text-white">
            <div
              className="absolute inset-0 flex h-1/6 items-center justify-center rounded-t-2xl py-3"
              style={{
                background:
                  'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)',
              }}
            >
              <p className="text-2xl font-semibold text-white">Special Event</p>
            </div>
            <div className="absolute -left-[60px] bottom-0 h-64 w-96 bg-gray-700 [clip-path:polygon(31%_70%,_10%_70%,_0_90%,_0_100%,_31%_100%)]"></div>
            <div className="absolute -right-[48px] bottom-0 h-64 w-72 bg-gray-700 [clip-path:polygon(78%_60%,_78%_100%,_100%_100%,_100%_88%)]">
              asdf
            </div>
          </div>
        </div>
        <div className="h-2/3 w-2/5">
          <div className="relative h-full rounded-t-2xl bg-gray-700 p-4 text-white [clip-path:polygon(0_0,_0_80%,_10%_90%,_10%_100%,_100%_100%,_100%_0)]">
            <div
              className="absolute inset-0 flex h-1/6 items-center justify-center rounded-t-2xl py-3"
              style={{
                background:
                  'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)',
              }}
            >
              <p className="text-2xl font-semibold text-white">Special Event</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
