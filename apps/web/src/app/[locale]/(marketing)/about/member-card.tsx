import Image from 'next/image';

interface MemberCardProps {
  name: string;
  role: string;
}

export default function MemberCard({ name, role }: MemberCardProps) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex w-full justify-center">
        <Image
          src="/members/people.png"
          width={1000}
          height={1000}
          alt="people"
          className="w-5/6 rounded-lg md:w-2/3"
        />
      </div>
      <p className="mt-3 text-center text-xl font-black md:text-xl">{name}</p>
      <p className="mt-2 text-center text-lg font-semibold md:text-xl">
        {role}
      </p>
    </div>
  );
}
