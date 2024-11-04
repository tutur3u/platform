import Image from 'next/image';

export default function Events() {
  return (
    <div className="relative w-full py-8">
      <div className="bg-foreground/10 rounded-3xl p-4 backdrop-blur-xl md:p-8">
        <div className="flex grid-cols-7 grid-rows-2 flex-col gap-10 md:grid">
          <div className="relative col-span-2 min-h-60 overflow-hidden rounded-xl">
            <Image
              src="/members/people.png"
              alt="people"
              className="object-cover"
              fill
            />
          </div>
          <div className="relative col-span-3 row-span-2 min-h-60 overflow-hidden rounded-xl md:h-2/3">
            <Image
              src="/members/people.png"
              alt="people"
              className="object-cover"
              fill
            />
          </div>
          <div className="relative col-span-2 min-h-60 overflow-hidden rounded-xl">
            <Image
              src="/members/people.png"
              alt="people"
              className="object-cover"
              fill
            />
          </div>
          <div className="relative col-span-2 min-h-60 overflow-hidden rounded-xl">
            <Image
              src="/members/people.png"
              alt="people"
              className="object-cover"
              fill
            />
          </div>
          <div className="relative col-span-2 min-h-60 overflow-hidden rounded-xl">
            <Image
              src="/members/people.png"
              alt="people"
              className="object-cover"
              fill
            />
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10 flex items-center justify-center">
        <div className="aspect-square rounded-full bg-[radial-gradient(circle,_rgba(217,180,48,0.8)_0%,_rgba(113,113,122,0.1)_80%)] md:h-64 md:w-64 lg:h-[36rem] lg:w-[36rem]"></div>
      </div>
    </div>
  );
}
