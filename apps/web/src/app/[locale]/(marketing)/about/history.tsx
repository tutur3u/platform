'use client';

import { TimelineCard } from './timeline-card';
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@ncthub/ui/carousel';
import { cn } from '@ncthub/utils/format';
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
    const onReInit = () => {
      emblaApi.scrollTo(0);
      setSelectedIndex(1);
    };
    onReInit();

    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onReInit);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onReInit);
    };
  }, [emblaApi]);

  return (
    <div className="space-y-24">
      <div className="space-y-8">
        <div
          className={cn(
            'mt-8 flex h-24 w-full items-center justify-center rounded-lg border-2 bg-gradient-to-r py-2 text-center lg:h-28',
            'border-[#B8D4E3] from-[#D4E8F0] via-[#F8F9FA] to-[#F5F0D8]',
            'dark:border-[#5FC6E5] dark:from-[#356F80] dark:via-[#030303] dark:to-[#A58211]'
          )}
        >
          <p
            className={cn(
              'bg-gradient-to-r bg-clip-text p-3 text-center text-3xl font-black tracking-normal text-transparent md:text-5xl lg:text-6xl lg:tracking-wide',
              'from-[#D4A017] to-[#1B8A9A]',
              'dark:from-[#F4B71A] dark:to-[#1AF4E6]'
            )}
          >
            NEO Culture Tech History
          </p>
        </div>

        <p className="mx-auto max-w-2xl text-center text-lg text-muted-foreground">
          A journey of innovation, community, and passion for technology. Step
          through our history and see how we've grown.
        </p>
      </div>

      <Carousel setApi={setEmblaApi}>
        <CarouselContent>
          {timelineData.map((item, index) => (
            <CarouselItem key={index} className="basis-1/3">
              {item && (
                <TimelineCard
                  year={item.year}
                  title={item.title}
                  description={item.description}
                  isSelected={selectedIndex === index}
                />
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
