'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  BrainCircuit,
  Calendar,
  Heart,
  MessageCircle,
  Smile,
  SmilePlus,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-8 text-center">
        <Badge
          variant="outline"
          className="bg-background/50 mb-4 backdrop-blur-sm"
        >
          <Heart className="mr-2 h-4 w-4 text-pink-500" />
          Welcome to Famigo
        </Badge>
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl">
          Your Family Connection Hub
        </h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-xl">
          Strengthen relationships across generations with AI-powered
          communication tools
        </p>
      </div>

      {/* Family Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10 rounded-xl bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 p-6 dark:from-blue-500/20 dark:via-purple-500/20 dark:to-pink-500/20"
      >
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div>
            <h2 className="mb-2 text-2xl font-bold">Nguyen Family</h2>
            <p className="text-muted-foreground">
              Members: 4 active in the last 24 hours
            </p>
            <div className="mt-4 flex gap-2">
              <Badge className="bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400">
                All caught up!
              </Badge>
              <Badge className="bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400">
                2 new messages
              </Badge>
            </div>
          </div>
          <div className="flex -space-x-3">
            <div className="border-background relative z-30 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-purple-500/20 text-sm font-medium text-purple-600">
              M
            </div>
            <div className="border-background relative z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-blue-500/20 text-sm font-medium text-blue-600">
              D
            </div>
            <div className="border-background relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-pink-500/20 text-sm font-medium text-pink-600">
              S
            </div>
            <div className="border-background relative flex h-10 w-10 items-center justify-center rounded-full border-2 bg-green-500/20 text-sm font-medium text-green-600">
              L
            </div>
          </div>
        </div>
      </motion.div>

      {/* Core Features Grid */}
      <h2 className="mb-6 text-2xl font-bold">Core Features</h2>
      <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 pb-2 dark:from-purple-500/20 dark:to-blue-500/20">
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-purple-500" />
              AI Communication Mediator
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <CardDescription className="text-foreground/80 mb-4">
              Fami helps deliver sensitive thoughts and bridge communication
              gaps between parents and children
            </CardDescription>
            <Button size="sm" variant="outline" className="group">
              Start a Conversation
              <BrainCircuit className="ml-2 h-4 w-4 text-purple-500 transition-transform group-hover:translate-x-1" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-pink-500/10 to-rose-500/10 pb-2 dark:from-pink-500/20 dark:to-rose-500/20">
            <CardTitle className="flex items-center gap-2">
              <SmilePlus className="h-5 w-5 text-pink-500" />
              Daily Family Updates
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <CardDescription className="text-foreground/80 mb-4">
              Share and view daily moods, photos, and moments with your loved
              ones in a private space
            </CardDescription>
            <Button size="sm" variant="outline" className="group">
              Share Today's Moment
              <MessageCircle className="ml-2 h-4 w-4 text-pink-500 transition-transform group-hover:translate-x-1" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 pb-2 dark:from-blue-500/20 dark:to-cyan-500/20">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              Smart Family Calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <CardDescription className="text-foreground/80 mb-4">
              Coordinate family gatherings and sync schedules to find the
              perfect time for meaningful connections
            </CardDescription>
            <Button size="sm" variant="outline" className="group">
              Plan Next Gathering
              <Calendar className="ml-2 h-4 w-4 text-blue-500 transition-transform group-hover:translate-x-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Family Status Updates */}
      <div className="mb-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Family Updates</h2>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            View All
          </Button>
        </div>

        <div className="grid gap-4">
          <div className="border-foreground/10 bg-background/60 dark:border-foreground/5 flex items-center gap-4 rounded-lg border p-4 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 text-sm font-medium text-green-600">
              L
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">Linh</p>
                <Badge variant="outline" className="text-xs font-normal">
                  Mom
                </Badge>
                <Smile className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-muted-foreground text-sm">
                Made dinner reservations for Saturday at 7PM
              </p>
            </div>
            <div className="text-muted-foreground ml-auto text-xs">2h ago</div>
          </div>

          <div className="border-foreground/10 bg-background/60 dark:border-foreground/5 flex items-center gap-4 rounded-lg border p-4 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-sm font-medium text-blue-600">
              D
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">Duc</p>
                <Badge variant="outline" className="text-xs font-normal">
                  Dad
                </Badge>
                <Smile className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-muted-foreground text-sm">
                Shared a photo from his fishing trip
              </p>
            </div>
            <div className="text-muted-foreground ml-auto text-xs">5h ago</div>
          </div>

          <div className="border-foreground/10 bg-background/60 dark:border-foreground/5 flex items-center gap-4 rounded-lg border p-4 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-sm font-medium text-purple-600">
              M
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">Minh</p>
                <Badge variant="outline" className="text-xs font-normal">
                  Son
                </Badge>
                <Smile className="h-4 w-4 text-purple-500" />
              </div>
              <p className="text-muted-foreground text-sm">
                Needs help with math homework tonight
              </p>
            </div>
            <div className="text-muted-foreground ml-auto text-xs">1d ago</div>
          </div>
        </div>
      </div>

      {/* Upcoming Calendar */}
      <h2 className="mb-6 text-2xl font-bold">Upcoming Family Events</h2>
      <div className="mb-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="border-foreground/10 dark:border-foreground/5 rounded-lg border bg-gradient-to-br from-blue-500/5 to-purple-500/5 p-4 backdrop-blur-sm dark:from-blue-500/10 dark:to-purple-500/10">
          <div className="mb-2 flex justify-between">
            <Badge className="bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400">
              Saturday
            </Badge>
            <span className="text-sm font-medium">7:00 PM</span>
          </div>
          <h3 className="mb-1 font-medium">Family Dinner</h3>
          <p className="text-muted-foreground mb-3 text-sm">
            Golden Dragon Restaurant
          </p>
          <div className="flex justify-between">
            <div className="flex -space-x-2">
              <div className="border-background flex h-6 w-6 items-center justify-center rounded-full border-2 bg-blue-500/20 text-xs font-medium text-blue-600">
                D
              </div>
              <div className="border-background flex h-6 w-6 items-center justify-center rounded-full border-2 bg-green-500/20 text-xs font-medium text-green-600">
                L
              </div>
              <div className="border-background flex h-6 w-6 items-center justify-center rounded-full border-2 bg-purple-500/20 text-xs font-medium text-purple-600">
                +2
              </div>
            </div>
            <Button size="sm" variant="ghost">
              Details
            </Button>
          </div>
        </div>

        <div className="border-foreground/10 dark:border-foreground/5 rounded-lg border bg-gradient-to-br from-pink-500/5 to-orange-500/5 p-4 backdrop-blur-sm dark:from-pink-500/10 dark:to-orange-500/10">
          <div className="mb-2 flex justify-between">
            <Badge className="bg-pink-500/20 text-pink-600 dark:bg-pink-500/30 dark:text-pink-400">
              Sunday
            </Badge>
            <span className="text-sm font-medium">2:00 PM</span>
          </div>
          <h3 className="mb-1 font-medium">Movie Afternoon</h3>
          <p className="text-muted-foreground mb-3 text-sm">Galaxy Cinema</p>
          <div className="flex justify-between">
            <div className="flex -space-x-2">
              <div className="border-background flex h-6 w-6 items-center justify-center rounded-full border-2 bg-pink-500/20 text-xs font-medium text-pink-600">
                S
              </div>
              <div className="border-background flex h-6 w-6 items-center justify-center rounded-full border-2 bg-purple-500/20 text-xs font-medium text-purple-600">
                M
              </div>
            </div>
            <Button size="sm" variant="ghost">
              Details
            </Button>
          </div>
        </div>

        <div className="border-foreground/10 dark:border-foreground/5 rounded-lg border bg-gradient-to-br from-green-500/5 to-teal-500/5 p-4 backdrop-blur-sm dark:from-green-500/10 dark:to-teal-500/10">
          <div className="mb-2 flex justify-between">
            <Badge className="bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400">
              Next Week
            </Badge>
            <span className="text-sm font-medium">All Day</span>
          </div>
          <h3 className="mb-1 font-medium">Grandparents Visit</h3>
          <p className="text-muted-foreground mb-3 text-sm">Home</p>
          <div className="flex justify-between">
            <div className="flex -space-x-2">
              <div className="border-background flex h-6 w-6 items-center justify-center rounded-full border-2 bg-blue-500/20 text-xs font-medium text-blue-600">
                D
              </div>
              <div className="border-background flex h-6 w-6 items-center justify-center rounded-full border-2 bg-green-500/20 text-xs font-medium text-green-600">
                L
              </div>
              <div className="border-background flex h-6 w-6 items-center justify-center rounded-full border-2 bg-purple-500/20 text-xs font-medium text-purple-600">
                +4
              </div>
            </div>
            <Button size="sm" variant="ghost">
              Details
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/family/chat">
          <Button
            size="lg"
            className="gap-2 border-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white"
          >
            Family Chat <MessageCircle className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/family/calendar">
          <Button
            size="lg"
            variant="outline"
            className="border-foreground/10 bg-background/60 dark:border-foreground/5 gap-2 backdrop-blur-sm"
          >
            View Calendar <Calendar className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/fami">
          <Button
            size="lg"
            variant="outline"
            className="border-foreground/10 bg-background/60 dark:border-foreground/5 gap-2 backdrop-blur-sm"
          >
            Talk to Fami <BrainCircuit className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
