'use client';

import { timelineData } from './data';
import { TimelineCard } from './timeline-card';
import { Badge } from '@ncthub/ui/badge';
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@ncthub/ui/carousel';
import { Award, Sparkles } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

export default function History() {
  const [emblaApi, setEmblaApi] = useState<CarouselApi | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(1);

  const timelineDataWithNull = useMemo(
    () => [null, ...timelineData, null],
    [timelineData]
  );

  const onSelect = () => {
    if (!emblaApi) return;

    setSelectedIndex(emblaApi.selectedScrollSnap() + 1);
  };

  const onScroll = () => {
    if (!emblaApi) return;

    const root = emblaApi.rootNode();
    const slides = emblaApi.slideNodes();
    const slidesInView = emblaApi.slidesInView();

    if (slidesInView.length === 0) return;

    const rootRect = root.getBoundingClientRect();
    const rootCenter = rootRect.left + rootRect.width / 2;

    let closestSlide = slidesInView[0] ?? 0;
    let minDistance = Infinity;

    slidesInView.forEach((slideIndex) => {
      const slideRect = slides[slideIndex]?.getBoundingClientRect();
      if (!slideRect) return;

      const slideCenter = slideRect.left + slideRect.width / 2;
      const distance = Math.abs(slideCenter - rootCenter);

      if (distance < minDistance) {
        minDistance = distance;
        closestSlide = slideIndex;
      }
    });

    const newSelectedIndex = closestSlide;

    setSelectedIndex((selectedIndex) => {
      if (
        newSelectedIndex !== selectedIndex &&
        newSelectedIndex !== 0 &&
        newSelectedIndex !== slides.length - 1
      ) {
        return newSelectedIndex;
      }

      return selectedIndex;
    });
  };

  const onReInit = () => {
    if (!emblaApi) return;

    emblaApi.scrollTo(0);
    setSelectedIndex(1);
  };

  useEffect(() => {
    if (!emblaApi) return;

    onReInit();

    emblaApi.on('select', onSelect);
    emblaApi.on('scroll', onScroll);
    emblaApi.on('reInit', onReInit);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('scroll', onScroll);
      emblaApi.off('reInit', onReInit);
    };
  }, [emblaApi]);

  return (
    <div className="space-y-10">
      <div className="space-y-8 text-center">
        {/* Hero Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2"
        >
          <Sparkles className="h-5 w-5 text-[#FBC721]" />
          <Badge
            variant="outline"
            className="border-[#5FC6E5]/50 px-3 py-1 text-sm text-[#5FC6E5]"
          >
            Our Journey
          </Badge>
          <Sparkles className="h-5 w-5 text-[#FBC721]" />
        </motion.div>

        {/* Main Title */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-4xl font-extrabold leading-tight md:text-5xl lg:text-6xl"
        >
          NEO Culture Tech{' '}
          <span className="relative">
            <span className="border-b-4 border-[#FBC721] text-[#5FC6E5]">
              History
            </span>
            <motion.div
              className="absolute -right-2 -top-2"
              animate={{
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 3,
              }}
            >
              <Award className="h-5 w-5 text-[#FBC721] md:h-6 md:w-6" />
            </motion.div>
          </span>
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          viewport={{ once: true }}
          className="text-muted-foreground mx-auto max-w-3xl text-lg font-medium md:text-xl"
        >
          A journey of innovation, community, and passion for technology.{' '}
          <span className="relative font-semibold text-[#5FC6E5]">
            Step through our history
            <motion.span
              className="bg-linear-to-r absolute -bottom-1 left-0 right-0 h-0.5 from-[#5FC6E5] to-[#FBC721]"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              transition={{ duration: 1, delay: 1 }}
              viewport={{ once: true }}
            />
          </span>{' '}
          and see how we've grown.
        </motion.p>
      </div>

      {/* Mobile/Tablet: Grid Layout */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        viewport={{ once: true }}
        className="flex flex-col items-center gap-8 md:hidden"
      >
        {timelineDataWithNull.map(
          (item, index) =>
            item && (
              <TimelineCard
                key={index}
                year={item.year}
                title={item.title}
                description={item.description}
                isSelected={true}
              />
            )
        )}
      </motion.div>

      {/* Desktop: Carousel */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        viewport={{ once: true }}
        className="hidden md:block"
      >
        <Carousel setApi={setEmblaApi}>
          <CarouselContent>
            {timelineDataWithNull.map((item, index) => (
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
          <CarouselPrevious className="ml-16 h-12 w-12" />
          <CarouselNext className="mr-16 h-12 w-12" />
        </Carousel>
      </motion.div>
    </div>
  );
}
