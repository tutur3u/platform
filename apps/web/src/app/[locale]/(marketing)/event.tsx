import peopleImage from './people.png';
import Image from 'next/image';

export default function Event() {
  return (
    <div className="relative w-full py-8">
      <div className="bg-foreground/10 rounded-3xl p-4 backdrop-blur-xl md:p-8">
        <div className="flex grid-cols-7 grid-rows-2 flex-col gap-10 md:grid">
          <div className="col-span-2 rounded-xl bg-black/20">
            <div className="flex h-full flex-col gap-2 p-4">
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <Image
                  src={peopleImage}
                  alt="people"
                  className="object-cover"
                  fill
                />
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex flex-col gap-2 p-2">
                  <h3 className="text-lg font-semibold">Title</h3>
                  <p className="text-muted-foreground text-sm">Description</p>
                </div>
                <div className="flex flex-col p-2">
                  <p className="text-muted-foreground text-sm">Date</p>
                  <p className="text-muted-foreground text-sm">Location</p>
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-3 row-span-2 rounded-xl bg-black/20 md:h-2/3">
            <div className="flex h-full flex-col gap-2 p-4">
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <Image
                  src={peopleImage}
                  alt="people"
                  className="object-cover"
                  fill
                />
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex flex-col gap-2 p-2">
                  <h3 className="text-lg font-semibold">Title</h3>
                  <p className="text-muted-foreground text-sm">Description</p>
                </div>
                <div className="flex flex-col p-2">
                  <p className="text-muted-foreground text-sm">Date</p>
                  <p className="text-muted-foreground text-sm">Location</p>
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-2 rounded-xl bg-black/20">
            <div className="flex h-full flex-col gap-2 p-4">
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <Image
                  src={peopleImage}
                  alt="people"
                  className="object-cover"
                  fill
                />
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex flex-col gap-2 p-2">
                  <h3 className="text-lg font-semibold">Title</h3>
                  <p className="text-muted-foreground text-sm">Description</p>
                </div>
                <div className="flex flex-col p-2">
                  <p className="text-muted-foreground text-sm">Date</p>
                  <p className="text-muted-foreground text-sm">Location</p>
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-2 rounded-xl bg-black/20">
            <div className="flex h-full flex-col gap-2 p-4">
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <Image
                  src={peopleImage}
                  alt="people"
                  className="object-cover"
                  fill
                />
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex flex-col gap-2 p-2">
                  <h3 className="text-lg font-semibold">Title</h3>
                  <p className="text-muted-foreground text-sm">Description</p>
                </div>
                <div className="flex flex-col p-2">
                  <p className="text-muted-foreground text-sm">Date</p>
                  <p className="text-muted-foreground text-sm">Location</p>
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-2 rounded-xl bg-black/20">
            <div className="flex h-full flex-col gap-2 p-4">
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <Image
                  src={peopleImage}
                  alt="people"
                  className="object-cover"
                  fill
                />
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex flex-col gap-2 p-2">
                  <h3 className="text-lg font-semibold">Title</h3>
                  <p className="text-muted-foreground text-sm">Description</p>
                </div>
                <div className="flex flex-col p-2">
                  <p className="text-muted-foreground text-sm">Date</p>
                  <p className="text-muted-foreground text-sm">Location</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10 flex items-center justify-center">
        <div className="aspect-square h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(217,180,48,0.8)_0%,_rgba(113,113,122,0.1)_80%)] md:h-64 md:w-64 lg:h-[36rem] lg:w-[36rem]"></div>
      </div>
    </div>
  );
}
