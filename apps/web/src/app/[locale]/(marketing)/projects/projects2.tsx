import { Separator } from '@repo/ui/components/ui/separator';

const Projects = () => {
  return (
    <>
      <div className="flex items-center justify-center">
        <div className="relative w-80 overflow-hidden rounded-lg border-2">
          <div className="z-10 flex h-full flex-col p-6 text-white">
            <div className="jusity-center flex flex-col">
              <p className="mb-4 text-center text-2xl font-bold">Neo Checker</p>
              <Separator className="my-2" />
              <h2 className="mb-2 text-center text-xl">Vo Hoang Phuc</h2>
              <p className="mb-5 text-center text-base text-gray-400">
                The first stable release of Neo Crush With new features and
                improvements.
              </p>
            </div>

            <div className="space-y-4">
              <button className="w-full rounded-lg bg-gradient-to-b from-[#1AF4E6] to-white/25 px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90">
                Web Development
              </button>
              <button className="w-full rounded-lg bg-gradient-to-b from-[#1AF4E6] to-white/25 px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90">
                In progress
              </button>
            </div>
          </div>

          <div className="absolute right-0 top-0 h-16 w-16 -translate-y-8 translate-x-8 rotate-45 transform bg-gray-900"></div>
          <div className="absolute bottom-0 right-0 h-16 w-16 translate-x-8 translate-y-8 -rotate-45 transform bg-gray-900"></div>
        </div>
      </div>
    </>
  );
};
export default Projects;
