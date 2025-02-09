import Image from 'next/image';

interface MemberCardProps {
  name: string;
  role: string;
  image: string;
}

export default function MemberCard({ name, role, image }: MemberCardProps) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-full w-full justify-center">
        <Image
          src={image}
          width={1000}
          height={1000}
          alt={name}
          className="w-full rounded-lg object-cover md:w-2/3"
        />
      </div>
      <p className="mt-3 text-center text-xl font-black md:text-xl">{name}</p>
      <p className="mt-2 text-center text-lg font-semibold md:text-xl">
        {role}
      </p>
    </div>
  );
}
