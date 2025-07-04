'use client';

import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@ncthub/ui/carousel';
import { useEffect, useState } from 'react';

const timelineData = [
  null,
  {
    year: '2021',
    title: 'The Beginning',
    description: 'Once you have passion in technology, you are a part of us!',
  },
  {
    year: '2022',
    title: 'A Playground for Tech Enthusiasts',
    description:
      'Our club is a playground for tech enthusiasts and students from the School of Science, Engineering, and Technology.',
  },
  {
    year: '2023',
    title: 'Fueled by Passion',
    description:
      'We are a community fueled by the passion for technology and innovations.',
  },
  {
    year: '2024',
    title: 'Stronger Together',
    description:
      'STRONGER TOGETHER is our core value. As a club, we strive to create a community where everyone can learn and grow together.',
  },
  null,
];

export default function History() {
  const [emblaApi, setEmblaApi] = useState<CarouselApi | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(1);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap() + 1);
    };

    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi]);

  return (
    <div className="space-y-8">
      <div className="space-y-8 text-center">
        <div
          className="mt-8 flex h-24 w-full items-center justify-center rounded-lg border-2 border-[#5FC6E5] py-2 text-center lg:h-28"
          style={{
            background: `linear-gradient(
                to right,
                #356F80 0%, #030303 20%, /* Left gradient */
                #000000 40%, #000000 60%, /* Middle black section */
                #030303 80%, #A58211 100% /* Right gradient */
              )`,
          }}
        >
          <p className="bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text p-3 text-3xl font-black tracking-normal text-transparent md:text-5xl lg:text-6xl lg:tracking-wide">
            NEO Culture Tech History
          </p>
        </div>

        <p className="text-xl text-foreground">
          A journey of innovation, community, and passion for technology. Step
          through our history and see how we've grown.
        </p>
      </div>

      <Carousel setApi={setEmblaApi}>
        <CarouselContent>
          {timelineData.map((item, index) => (
            <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
              {item && (
                <div
                  className="h-full p-1"
                  style={{
                    transition:
                      'transform 0.5s ease-in-out, opacity 0.5s ease-in-out',
                    transform: `scale(${selectedIndex === index ? 1 : 0.75})`,
                    opacity: selectedIndex === index ? 1 : 0.6,
                  }}
                >
                  <div className="relative flex h-full flex-col items-center justify-center space-y-4 overflow-hidden rounded-lg bg-background/50 p-4 text-center shadow-lg">
                    <div className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-yellow-400 p-1">
                      <div className="flex size-full items-center justify-center rounded-full bg-background">
                        <p className="text-2xl font-bold text-cyan-400">
                          {item.year}
                        </p>
                      </div>
                    </div>
                    <h3 className="mt-1 text-xl font-bold text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    <div
                      className="absolute inset-0 bg-black/40"
                      style={{
                        transition: 'opacity 0.5s ease-in-out',
                        opacity: selectedIndex === index ? 0 : 1,
                      }}
                    />
                  </div>
                </div>
              )}
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="ml-16" />
        <CarouselNext className="mr-16" />
      </Carousel>
    </div>
  );
}
