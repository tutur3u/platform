import Image from 'next/image';
import AnimatedSection from '../animated-section';

export default function SponsorsList() {
  return (
    <div className="space-y-12">
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
        <div className="grid grid-cols-3">
          <AnimatedSection className="col-start-2">
            <div className="glass-card card-hover h-30 flex-1 rounded-2xl p-4">
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
        <h3 className="text-center font-bold text-2xl text-brand-teal uppercase shadow-text">
          Academic Sponsors
        </h3>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <AnimatedSection delay={0.1}>
            <div className="glass-card card-hover h-30 rounded-xl p-4">
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
            <div className="glass-card card-hover h-30 rounded-xl p-4">
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
            <div className="glass-card card-hover h-30 rounded-xl p-4">
              <Image
                src="/sponsors/maker-lab.png"
                alt="MakerLab.vn"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
          <AnimatedSection delay={0.4}>
            <div className="glass-card card-hover h-30 rounded-xl p-4">
              <Image
                src="/sponsors/aptech.png"
                alt="Aptech"
                width={100}
                height={100}
                className="h-full w-full object-contain"
              />
            </div>
          </AnimatedSection>
        </div>
      </div>
    </div>
  );
}
