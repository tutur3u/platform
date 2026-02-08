import Image from 'next/image';

export default function SponsorsSection() {
  const bronzeCategories = [
    'Media Partners',
    'Tech Partners',
    'Community Partners',
    'Academic Partners',
  ];

  return (
    <section id="sponsors" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-black text-3xl shadow-text md:text-4xl">
            OUR <span className="text-secondary">SPONSORS</span>
          </h2>
          <p className="mx-auto max-w-2xl font-bold text-foreground text-lg">
            These sponsors play an important role in making this event possible.
          </p>
        </div>

        <div className="space-y-16">
          {/* Gold Sponsors */}
          <div className="space-y-8">
            <h3 className="text-center font-black text-2xl text-yellow-400 uppercase shadow-text md:text-3xl">
              Gold Sponsors
            </h3>
            <div className="flex items-center justify-center gap-8">
              {[1, 2].map((index) => (
                <div
                  key={index}
                  className="glass-card card-hover h-30 max-w-md flex-1 rounded-2xl p-6"
                >
                  <Image
                    src="/sponsor_example.png"
                    alt={`Gold Sponsor ${index}`}
                    width={100}
                    height={100}
                    className="h-full w-full object-contain"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Silver Sponsors */}
          <div className="space-y-8">
            <h3 className="text-center font-black text-2xl text-gray-300 uppercase shadow-text md:text-3xl">
              Silver Sponsors
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {[1, 2, 3, 4].map((index) => (
                <div
                  key={index}
                  className="glass-card card-hover h-25 flex-1 rounded-2xl p-5"
                >
                  <Image
                    src="/sponsor_example.png"
                    alt={`Silver Sponsor ${index}`}
                    width={100}
                    height={100}
                    className="h-full w-full object-contain"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Bronze Sponsors */}
          <div className="space-y-8">
            <h3 className="text-center font-black text-2xl text-yellow-800 uppercase shadow-text md:text-3xl">
              Bronze Sponsors
            </h3>
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {bronzeCategories.map((category) => (
                <div key={category} className="space-y-4">
                  <h4 className="text-center font-bold text-lg text-primary uppercase shadow-text">
                    {category}
                  </h4>
                  <div className="flex flex-col gap-4">
                    {[1, 2, 3, 4].map((index) => (
                      <div
                        key={index}
                        className="glass-card card-hover h-25 rounded-xl p-4"
                      >
                        <Image
                          src="/sponsor_example.png"
                          alt={`${category} ${index}`}
                          width={100}
                          height={100}
                          className="h-full w-full object-contain"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
