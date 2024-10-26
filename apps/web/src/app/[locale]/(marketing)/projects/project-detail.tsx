import { Project } from './data';
import DemoProjectImage from './demo.png';
import peopleImage from './people.png';
import { Separator } from '@repo/ui/components/ui/separator';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface ProjectDetailProps {
  onClose: () => void;
  data: Project | undefined;
}

const sampleData = [
  {
    name: 'Nguyen Nguyen Nguyen',
    role: 'Project Leader',
  },
  {
    name: 'Nguyen Nguyen Nguyen',
    role: 'Designer',
  },
  {
    name: 'Nguyen Nguyen Nguyen',
    role: 'Developer',
  },
  {
    name: 'Nguyen Nguyen Nguyen',
    role: 'Developer',
  },
  {
    name: 'Nguyen Nguyen Nguyen',
    role: 'Developer',
  },
];

export default function ProjectDetail({ onClose, data }: ProjectDetailProps) {
  if (!data) {
    return null;
  }
  const { name, description, techStack } = data;
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative mx-auto h-[90%] w-[98%] max-w-3xl overflow-y-auto rounded-lg bg-[#262A3A] p-6 text-center md:w-[90%]"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="absolute right-4 top-4 cursor-pointer text-black"
          onClick={onClose}
        >
          x
        </p>

        <Image
          src={DemoProjectImage}
          alt="Demo Project"
          className="grounded-lg rounded-lg object-cover pt-7"
        />
        <p className="my-4 text-2xl font-extrabold text-white md:text-3xl lg:text-4xl">
          {name}
        </p>
        <Separator className="my-2" />
        <p className="mb-4 px-10 text-base md:text-xl lg:text-xl">
          {description}
        </p>
        <Separator className="my-2" />
        <p className="my-4 text-lg font-semibold text-white md:text-xl lg:text-2xl">
          Technologies
        </p>
        <div className="flex flex-wrap justify-center gap-5">
          {techStack?.map((tech, index) => (
            <div
              key={index}
              className="flex w-1/3 items-center justify-center rounded-3xl px-4 py-2 text-center md:w-1/4"
              style={{
                background:
                  'linear-gradient(180deg, rgba(244,183,26,0.7) 0%, rgba(135,213,128,0.6) 50%, rgba(26,244,230,0.5) 100%)',
              }}
            >
              <p className="whitespace-nowrap text-xs md:text-sm">{tech}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-lg font-semibold text-white md:text-xl lg:text-2xl">
          Our Contributors
        </p>
        <Separator className="my-2" />
        <div className="flex flex-col gap-4 py-4 md:px-6">
          {sampleData.map((person, index) => {
            return (
              <div className="flex items-center justify-between" key={index}>
                <div className="flex items-center gap-4 md:gap-6">
                  <Image
                    className="h-10 w-10 rounded-full object-cover md:h-12 md:w-12"
                    src={peopleImage}
                    alt="Contributor"
                  />
                  <p className="text-sm md:text-lg">{person.name}</p>
                </div>
                <div className="text-sm md:text-lg">{person.role}</div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
