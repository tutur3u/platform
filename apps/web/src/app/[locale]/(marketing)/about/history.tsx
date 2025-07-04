'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ncthub/ui/card';

const timelineData = [
  {
    year: '2024',
    title: 'Stronger Together',
    description:
      'STRONGER TOGETHER is our core value. As a club, we strive to create a community where everyone can learn and grow together.',
  },
  {
    year: '2023',
    title: 'Fueled by Passion',
    description:
      'We are a community fueled by the passion for technology and innovations.',
  },
  {
    year: '2022',
    title: 'A Playground for Tech Enthusiasts',
    description:
      'Our club is a playground for tech enthusiasts and students from the School of Science, Engineering, and Technology.',
  },
  {
    year: '2021',
    title: 'The Beginning',
    description: 'Once you have passion in technology, you are a part of us!',
  },
];

export default function History() {
  return (
    <div className="w-full py-8">
      <div className="container mx-auto max-w-5xl">
        <Card className="border-0 bg-gradient-to-br from-[#C6D9E3] to-cyan-50 shadow-lg shadow-cyan-500/10 dark:from-[#100921] dark:to-gray-800 dark:shadow-cyan-400/10">
          <CardHeader className="text-center">
            <CardTitle className="bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text p-2 text-4xl font-black tracking-normal text-transparent md:text-5xl lg:text-6xl lg:tracking-wide">
              NEO Culture Tech History
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              A journey of innovation, community, and passion for technology.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <div className="relative pl-6 before:absolute before:top-0 before:left-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-[#1AF4E6] before:to-[#F4B71A]">
              {timelineData.map((item) => (
                <div key={item.year} className="relative mb-8 pl-8">
                  <div className="absolute top-1 -left-2.5 h-5 w-5 rounded-full border-4 border-background bg-gradient-to-br from-cyan-400 to-yellow-400" />
                  <p className="text-sm font-semibold text-cyan-400">
                    {item.year}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
