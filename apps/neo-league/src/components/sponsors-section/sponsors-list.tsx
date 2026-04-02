import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@ncthub/ui/carousel';
import Image from 'next/image';
import AnimatedSection from '../animated-section';

const partners = Array.from({ length: 10 }, (_, index) => ({
  id: index,
  src: '/sponsors/fpt.png',
  alt: 'FPT',
}));

export default function SponsorsList() {
  return (
    <div className="space-y-12">
      {/* Diamond Sponsors */}
      <div className="space-y-8">
        <h3 className="bg-linear-to-b from-white to-amber-300 bg-clip-text text-center font-black text-2xl text-transparent uppercase shadow-text md:text-3xl">
          Diamond Sponsors
        </h3>
        <div className="grid grid-cols-3 gap-8">
          <AnimatedSection className="col-start-2">
            <div className="glass-card card-hover h-25 flex-1 rounded-2xl p-4">
              <Image
                src="/sponsors/fpt.png"
                alt="FPT"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
        </div>
      </div>

      {/* Gold Sponsors */}
      <div className="space-y-8">
        <h3 className="bg-linear-to-b from-yellow-300 to-yellow-400 bg-clip-text text-center font-black text-2xl text-transparent uppercase shadow-text md:text-3xl">
          Gold Sponsors
        </h3>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <AnimatedSection className="md:col-start-2">
            <div className="glass-card card-hover h-30 flex-1 rounded-2xl p-4">
              <Image
                src="/sponsors/big-o-coding.png"
                alt="Big O Coding"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
          <AnimatedSection delay={0.1}>
            <div className="glass-card card-hover h-30 flex-1 rounded-2xl p-4">
              <Image
                src="/sponsors/neax.png"
                alt="Neax"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
        </div>
      </div>

      {/* Platform Sponsors */}
      <div className="space-y-8">
        <h3 className="text-center font-bold text-2xl text-brand-light-blue uppercase shadow-text">
          Platform Sponsors
        </h3>
        <div className="grid grid-cols-3 gap-8">
          <AnimatedSection className="col-start-2">
            <div className="glass-card card-hover h-25 flex-1 rounded-2xl p-4">
              <Image
                src="/sponsors/ecloudvalley.png"
                alt="eCloudValley"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
        </div>
      </div>

      {/* Academic Sponsors */}
      <div className="space-y-8">
        <h3 className="text-center font-bold text-2xl text-brand-light-blue uppercase shadow-text">
          Academic Sponsors
        </h3>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <AnimatedSection>
            <div className="glass-card card-hover h-25 rounded-xl p-4">
              <Image
                src="/sponsors/student-council.png"
                alt="Student Council"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
          <AnimatedSection delay={0.1}>
            <div className="glass-card card-hover h-25 rounded-xl p-4">
              <Image
                src="/sponsors/aws.png"
                alt="AWS"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
          <AnimatedSection delay={0.2}>
            <div className="glass-card card-hover h-25 rounded-xl p-4">
              <Image
                src="/sponsors/hshop.webp"
                alt="HShop,vn"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
          <AnimatedSection delay={0.3}>
            <div className="glass-card card-hover h-25 rounded-xl p-4">
              <Image
                src="/sponsors/maker-lab.png"
                alt="MakerLab.vn"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
        </div>
      </div>

      {/* Our Partners */}
      <div className="mt-16 space-y-8">
        <h3 className="text-center font-bold text-2xl text-brand-light-blue uppercase shadow-text">
          Our Partners
        </h3>
        <AnimatedSection>
          <div className="px-12 md:px-16">
            <Carousel
              opts={{
                align: 'start',
                loop: false,
              }}
            >
              <CarouselContent>
                {partners.map((partner) => (
                  <CarouselItem
                    key={partner.id}
                    className="basis-1/2 md:basis-1/3 lg:basis-1/5"
                  >
                    <div className="flex h-24 items-center justify-center p-4 md:h-28">
                      <Image
                        src={partner.src}
                        alt={partner.alt}
                        width={160}
                        height={80}
                        className="h-full w-full object-contain"
                      />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious
                variant="link"
                className="font-bold text-primary/50 hover:text-primary"
              />
              <CarouselNext
                variant="link"
                className="font-bold text-primary/50 hover:text-primary"
              />
            </Carousel>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
