import Image from 'next/image';
import AnimatedSection from '../animated-section';

export default function SponsorsList() {
  return (
    <div className="space-y-16">
      {/* Gold Sponsors */}
      <div className="space-y-8">
        <h3 className="text-center font-black text-2xl text-yellow-400 uppercase shadow-text md:text-3xl">
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

      {/* Silver Sponsors */}
      <div className="space-y-8">
        <h3 className="text-center font-black text-2xl text-gray-300 uppercase shadow-text md:text-3xl">
          Silver Sponsors
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

      {/* Bronze Sponsors */}
      <div className="space-y-8">
        <h3 className="text-center font-black text-2xl text-yellow-800 uppercase shadow-text md:text-3xl">
          Bronze Sponsors
        </h3>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <AnimatedSection>
            <div className="space-y-4">
              <h4 className="text-center font-bold text-lg text-primary uppercase shadow-text">
                Media Partners
              </h4>
              <div className="flex flex-col gap-4">
                {[1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="glass-card card-hover h-25 rounded-xl p-4"
                  >
                    <Image
                      src="/sponsors/fpt.png"
                      alt={`Media Partner ${index}`}
                      width={100}
                      height={100}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>
          <AnimatedSection>
            <div className="space-y-4">
              <h4 className="text-center font-bold text-lg text-primary uppercase shadow-text">
                Technology Partners
              </h4>
              <div className="flex flex-col gap-4">
                <div className="glass-card card-hover h-25 rounded-xl p-4">
                  <Image
                    src="/sponsors/aws.png"
                    alt="AWS"
                    width={100}
                    height={100}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="glass-card card-hover h-25 rounded-xl p-4">
                  <Image
                    src="/sponsors/hshop.webp"
                    alt="HShop,vn"
                    width={100}
                    height={100}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="glass-card card-hover h-25 rounded-xl p-4">
                  <Image
                    src="/sponsors/maker-lab.png"
                    alt="MakerLab.vn"
                    width={100}
                    height={100}
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>
          </AnimatedSection>
          <AnimatedSection>
            <div className="space-y-4">
              <h4 className="text-center font-bold text-lg text-primary uppercase shadow-text">
                Community Partners
              </h4>
              <div className="flex flex-col gap-4">
                {[1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="glass-card card-hover h-25 rounded-xl p-4"
                  >
                    <Image
                      src="/sponsors/fpt.png"
                      alt={`Community Partner ${index}`}
                      width={100}
                      height={100}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>
          <AnimatedSection>
            <div className="space-y-4">
              <h4 className="text-center font-bold text-lg text-primary uppercase shadow-text">
                Academic Partners
              </h4>
              <div className="flex flex-col gap-4">
                <div className="glass-card card-hover h-25 rounded-xl p-4">
                  <Image
                    src="/rmit-sset.png"
                    alt="RMIT School of Science, Engineering and Technology"
                    width={100}
                    height={100}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="glass-card card-hover h-25 rounded-xl p-4">
                  <Image
                    src="/rmit-student-club-program.png"
                    alt="RMIT Student Club Program"
                    width={100}
                    height={100}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="glass-card card-hover h-25 rounded-xl p-4">
                  <Image
                    src="/sponsors/student-council.png"
                    alt="Student Council"
                    width={100}
                    height={100}
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </div>
  );
}
