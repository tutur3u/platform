import { Star} from "@tuturuuu/ui/icons";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import Image from "next/image";

export default function TestimonialsSection() {
  const t = useTranslations("boarding-pages.home");

  const [testimonials, setTestimonials] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/v1/testimonials")
      .then((res) => res.json())
      .then((data) => setTestimonials(data))
      .catch((err) => console.error(err));
  }, []);

  console.log("Testimonials: ", testimonials);
  return (
    <section id="testimonials" className="relative py-20 overflow-hidden">
      {/* Gradient overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-purple-50/60 to-indigo-50/80 dark:from-blue-950/40 dark:via-purple-950/30 dark:to-indigo-950/40" />
      <div className="absolute inset-0 backdrop-blur-sm" />

      <div className="relative container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-purple-400 dark:to-indigo-400">
            {t("testimonials.title")}
          </h2>
          <p className="mt-6 text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            {t("testimonials.description")}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="group relative rounded-2xl p-8 shadow-lg bg-white/80 dark:bg-gray-800/80 border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              {/* Gradient border effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />

              <div className="flex items-center mb-6">
                {[...Array(testimonial.stars)].map((_, i) => (
                  <Star
                    key={i}
                    className="h-5 w-5 text-yellow-400 fill-yellow-400"
                  />
                ))}
                {[...Array(5 - testimonial.stars)].map((_, i) => (
                  <Star
                    key={i}
                    className="h-5 w-5 text-gray-300 dark:text-gray-600"
                  />
                ))}
              </div>

              <blockquote className="text-gray-700 dark:text-gray-300 mb-8 text-lg leading-relaxed">
                "{testimonial.quote}"
              </blockquote>

              <div className="flex items-center">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 p-[2px]">
                    <div className="w-full h-full rounded-full bg-white dark:bg-gray-800 p-[2px]">
                      <Image    
                        src={testimonial.avatar || `https://avatar.vercel.sh/${testimonial.name}`}
                        alt={testimonial.name}
                        width={40}
                        height={40}
                        className="rounded-full object-cover w-full h-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">
                    {testimonial.name}
                  </p>
                  {testimonial.course ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
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
