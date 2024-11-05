import Image from 'next/image';

const EventImages = [
  '/club-day/sem-c.jpg',
  '/media/marketing/award-day.jpg',
  '/media/marketing/gft.jpg',
  '/media/marketing/netcompany.jpg',
  '/media/marketing/club-day-sem-b.jpg',
];

export default function Events() {
  return (
    <div className="relative w-full py-8">
      <div className="bg-foreground/10 rounded-3xl p-4 backdrop-blur-xl md:p-8">
        <div className="flex grid-cols-7 grid-rows-2 flex-col gap-10 md:grid">
          {EventImages.slice(0, 5).map((link, index) =>
            index === 0 ? (
              <PrimaryEventCard key={index} link={link} />
            ) : (
              <EventCard key={index} link={link} />
            )
          )}
        </div>
      </div>
      <div className="absolute inset-0 -z-10 flex items-center justify-center">
        <div className="aspect-square rounded-full bg-[radial-gradient(circle,_rgba(217,180,48,0.8)_0%,_rgba(113,113,122,0.1)_80%)] md:h-64 md:w-64 lg:h-[36rem] lg:w-[36rem]"></div>
      </div>
    </div>
  );
}

const PrimaryEventCard = ({ link }: { link: string }) => {
  return (
    <div className="relative col-span-3 col-start-3 row-span-2 row-start-1 aspect-square overflow-hidden rounded-xl">
      <Image src={link} alt="image" className="object-cover" fill />
    </div>
  );
};

const EventCard = ({ link }: { link: string }) => {
  return (
    <div className="relative col-span-2 aspect-square overflow-hidden rounded-xl">
      <Image src={link} alt="image" className="object-cover" fill />
    </div>
  );
};
