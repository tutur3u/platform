import { Star } from '@tuturuuu/ui/icons';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Testimonial } from './page';

export default function TestimonialsSection({
  testimonials,
}: {
  testimonials: Testimonial[];
}) {
  const t = useTranslations('boarding-pages.home');

  return (
    <section id="testimonials" className="relative overflow-hidden py-20">
      {/* Gradient overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-purple-50/60 to-indigo-50/80 dark:from-blue-950/40 dark:via-purple-950/30 dark:to-indigo-950/40" />
      <div className="absolute inset-0 backdrop-blur-sm" />

      <div className="container relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text font-bold text-4xl text-transparent tracking-tight dark:from-blue-400 dark:via-purple-400 dark:to-indigo-400">
            {t('testimonials.title')}
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-gray-600 text-xl dark:text-gray-300">
            {t('testimonials.description')}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name + testimonial.course}
              className="group hover:-translate-y-1 relative rounded-2xl border border-gray-200/50 bg-white/80 p-8 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl dark:border-gray-700/50 dark:bg-gray-800/80"
            >
              {/* Gradient border effect */}
              <div className="-z-10 absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-indigo-500/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              <div className="mb-6 flex items-center">
                {[...Array(testimonial.stars)].map((_, i) => (
                  <Star
                    key={`${testimonial.name}-filled-${i}`}
                    className="h-5 w-5 fill-yellow-400 text-yellow-400"
                  />
                ))}
                {[...Array(5 - testimonial.stars)].map((_, i) => (
                  <Star
                    key={`${testimonial.name}-empty-${i}`}
                    className="h-5 w-5 text-gray-300 dark:text-gray-600"
                  />
                ))}
              </div>

              <blockquote className="mb-8 text-gray-700 text-lg leading-relaxed dark:text-gray-300">
                "{testimonial.quote}"
              </blockquote>

              <div className="flex items-center">
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 p-[2px]">
                    <div className="h-full w-full rounded-full bg-white p-[2px] dark:bg-gray-800">
                      <Image
                        src={
                          testimonial.avatar ||
                          `https://avatar.vercel.sh/${testimonial.name}`
                        }
                        alt={testimonial.name}
                        width={40}
                        height={40}
                        className="h-full w-full rounded-full object-cover"
                      />
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="font-semibold text-gray-900 text-lg dark:text-white">
                    {testimonial.name}
                  </p>
                  {testimonial.course ? (
                    <p className="text-gray-600 text-sm dark:text-gray-400">
                      {testimonial.course}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
