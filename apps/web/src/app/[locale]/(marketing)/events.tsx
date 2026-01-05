'use client';

import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import { Card, CardContent } from '@ncthub/ui/card';
import {
  ArrowRight,
  Calendar,
  Camera,
  MapPin,
  Sparkles,
  Users,
} from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

type EventType = {
  src: string;
  title: string;
  description: string;
  date: string;
  attendees: string;
  location: string;
  link?: string;
};

const EventImages: EventType[] = [
  {
    src: '/club-day/sem-c-2025.png',
    title: 'Club Day Semester C 2025',
    description: 'Join us for an exciting club day experience',
    date: 'November 2025',
    attendees: '100+',
    location: 'RMIT Campus',
  },
  {
    src: '/media/marketing/workshops/cv-workshop.jpg',
    title: 'Internal Training: CV Workshop',
    description: 'Internal Training for Neo Culture Tech members',
    date: 'September 2025',
    attendees: '20+',
    location: 'RMIT Campus',
    link: 'https://www.facebook.com/share/p/1aLwzokR2b/',
  },
  {
    src: '/media/marketing/events/netcompany-tour.jpg',
    title: 'Netcompany Tour',
    description: 'Guided company tour with demos and networking for members',
    date: 'August 2025',
    attendees: '50+',
    location: 'Netcompany Campus',
    link: 'https://www.facebook.com/share/p/16J9j3s46A/',
  },
  {
    src: '/media/marketing/events/netcompany-talk-show.jpg',
    title: 'Neo Connect x Netcompany',
    description: 'Networking session with Netcompany',
    date: 'August 2025',
    attendees: '40+',
    location: 'RMIT Campus',
    link: 'https://www.facebook.com/share/p/17LGGx4tzH/',
  },
  {
    src: '/media/marketing/neo-league/neo-league-2025.png',
    title: 'Neo League - Prompt The Future 2025',
    description: 'AI prompt engineering competition',
    date: 'June 2025',
    attendees: '170+',
    location: 'RMIT Campus',
    link: 'https://nova.ai.vn',
  },
];

export default function Events() {
  return (
    <motion.div
      id="events"
      className="relative w-full py-8"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 1 }}
      viewport={{ once: true }}
    >
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
        className="mb-12 text-center"
      >
        <div className="mb-4 inline-flex items-center gap-2">
          <Camera className="h-6 w-6 text-primary" />
          <Badge variant="outline" className="px-3 py-1 text-sm">
            Our Events
          </Badge>
          <Camera className="h-6 w-6 text-primary" />
        </div>

        <h2 className="mb-4 text-3xl font-bold md:text-4xl lg:text-5xl">
          Memorable{' '}
          <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Moments
          </span>
        </h2>

        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Experience the highlights of our vibrant community through these
          unforgettable events
        </p>
      </motion.div>

      {/* Events Grid */}
      <div className="rounded-3xl border border-border/50 bg-background/60 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Primary Event Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="md:col-span-2 md:row-span-2 lg:col-span-2"
          >
            <PrimaryEventCard event={EventImages[0]!} />
          </motion.div>

          {/* Secondary Event Cards */}
          {EventImages.slice(1).map((event, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: (index + 1) * 0.1 }}
              viewport={{ once: true }}
            >
              <SecondaryEventCard event={event} />
            </motion.div>
          ))}
        </div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Card className="mx-auto max-w-md border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
            <CardContent className="p-6">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
              <h3 className="mb-2 text-xl font-semibold">
                Join Our Next Event
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Don't miss out on our upcoming activities and networking
                opportunities
              </p>
              <Link
                href={'https://www.facebook.com/rmit.nct'}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="w-full">
                  View All Events
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Background Elements */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 h-64 w-64 rounded-full bg-secondary/10 blur-3xl" />
      </div>
    </motion.div>
  );
}

const PrimaryEventCard = ({ event }: { event: EventType }) => {
  return (
    <Link
      href={event.link ? event.link : 'https://www.facebook.com/rmit.nct'}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Card className="group relative h-full min-h-[400px] overflow-hidden border-2 transition-all duration-500 hover:border-primary/50 hover:shadow-2xl">
        <div className="relative h-full">
          <Image
            src={event.src}
            alt={event.title}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            fill
          />

          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Content */}
          <div className="absolute right-0 bottom-0 left-0 p-6 text-white">
            <Badge className="mb-3 bg-primary/90 hover:bg-primary">
              Featured Event
            </Badge>

            <h3 className="mb-2 text-2xl font-bold">{event.title}</h3>
            <p className="mb-4 text-sm text-white/80">{event.description}</p>

            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{event.date}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{event.attendees}</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                <span>{event.location}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
};

const SecondaryEventCard = ({ event }: { event: EventType }) => {
  return (
    <Link
      href={event.link ? event.link : 'https://www.facebook.com/rmit.nct'}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Card className="group relative h-48 overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-xl">
        <div className="relative h-full">
          <Image
            src={event.src}
            alt={event.title}
            className="object-cover transition-transform duration-300 group-hover:scale-110"
            fill
          />

          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Content */}
          <div className="absolute right-0 bottom-0 left-0 p-4 text-white">
            <h4 className="mb-1 text-sm font-semibold">{event.title}</h4>
            <p className="mb-2 text-xs text-white/70">{event.description}</p>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{event.date}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{event.attendees}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
};
