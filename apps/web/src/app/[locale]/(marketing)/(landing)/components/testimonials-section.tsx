'use client';

import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import { ChevronLeft, ChevronRight, Star } from '@tuturuuu/ui/icons';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

gsap.registerPlugin(ScrollTrigger);

interface Testimonial {
  name: string;
  role: string;
  company: string;
  image: string;
  quote: string;
  stars: number;
}

const testimonials: Testimonial[] = [
  {
    name: 'Sarah Johnson',
    role: 'Product Manager',
    company: 'TechCorp',
    image: '/placeholder.svg?height=80&width=80',
    quote:
      "TuPlan has completely transformed how I manage my tasks. The LLM understands my priorities better than I do sometimes! I've reclaimed 12 hours weekly that used to be lost to scheduling and reprioritizing.",
    stars: 5,
  },
  {
    name: 'Michael Chen',
    role: 'Engineering Lead',
    company: 'InnovateLabs',
    image: '/placeholder.svg?height=80&width=80',
    quote:
      "As someone who manages complex projects with tight deadlines, TuPlan has been revolutionary. It balances my team's workload perfectly and ensures we never miss deadlines. Google Calendar could never do this.",
    stars: 5,
  },
  {
    name: 'Emily Rodriguez',
    role: 'Marketing Director',
    company: 'BrandForward',
    image: '/placeholder.svg?height=80&width=80',
    quote:
      "The way TuPlan understands task context and adjusts my schedule accordingly is mind-blowing. I can focus on creative work while it handles the logistics of my day. I've gained back so much mental space.",
    stars: 5,
  },
  {
    name: 'David Kim',
    role: 'Freelance Designer',
    company: 'Self-employed',
    image: '/placeholder.svg?height=80&width=80',
    quote:
      "TuPlan helps me balance multiple client projects with varying priorities and deadlines. It's like having a personal assistant who knows exactly how long each task will take and when I work best. Game-changer!",
    stars: 5,
  },
];

export function TestimonialsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const nextTestimonial = () => {
    setActiveIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setActiveIndex(
      (prev) => (prev - 1 + testimonials.length) % testimonials.length
    );
  };

  useEffect(() => {
    if (!sectionRef.current) return;

    gsap.from('.testimonials-title', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.testimonials-title',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  useEffect(() => {
    const testimonialElement = document.querySelector('.testimonial-content');
    if (testimonialElement) {
      gsap.from(testimonialElement, {
        opacity: 0,
        y: 20,
        duration: 0.5,
      });
    }
  }, [activeIndex]);

  return (
    <section ref={sectionRef} className="pt-40">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="testimonials-title mb-4 text-3xl font-bold md:text-4xl">
            <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              What Our Users Say
            </span>
          </h2>
          <p className="testimonials-title mx-auto max-w-3xl text-xl text-balance text-muted-foreground">
            Join thousands of professionals who have transformed their
            productivity with TuPlan.
          </p>
        </div>

        <div className="mx-auto max-w-4xl">
          <div className="relative rounded-2xl bg-white p-8 shadow-xl md:p-12">
            <div className="absolute top-0 left-0 h-24 w-24 -translate-x-4 -translate-y-4 transform rounded-full bg-purple-200 opacity-50"></div>
            <div className="absolute right-0 bottom-0 h-24 w-24 translate-x-4 translate-y-4 transform rounded-full bg-blue-200 opacity-50"></div>

            <div className="testimonial-content relative">
              <div className="mb-6 flex flex-col items-center gap-6 md:flex-row md:items-start">
                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-4 border-purple-100">
                  <Image
                    src={testimonials[activeIndex]?.image || '/placeholder.svg'}
                    alt={testimonials[activeIndex]?.name || ''}
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <div className="mb-2 flex">
                    {[...Array(testimonials[activeIndex]?.stars || 0)].map(
                      (_, i) => (
                        <Star
                          key={i}
                          className="h-5 w-5 fill-current text-yellow-400"
                        />
                      )
                    )}
                    {[
                      ...Array(5 - (testimonials[activeIndex]?.stars || 0)),
                    ].map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-gray-300" />
                    ))}
                  </div>
                  <p className="mb-6 text-xl italic md:text-2xl">
                    &apos;{testimonials[activeIndex]?.quote}&apos;
                  </p>
                  <div>
                    <p className="text-lg font-bold">
                      {testimonials[activeIndex]?.name}
                    </p>
                    <p className="text-muted-foreground">
                      {testimonials[activeIndex]?.role},{' '}
                      {testimonials[activeIndex]?.company}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={prevTestimonial}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 transition-colors hover:bg-purple-200"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex gap-2">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveIndex(index)}
                    className={`h-3 w-3 rounded-full ${activeIndex === index ? 'bg-purple-600' : 'bg-purple-200'}`}
                  ></button>
                ))}
              </div>
              <button
                onClick={nextTestimonial}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 transition-colors hover:bg-purple-200"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
