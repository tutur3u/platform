'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { Filter, GamepadIcon, Search, Sparkles, Trophy, X } from 'lucide-react';
import { useState } from 'react';

interface LeaderboardFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function LeaderboardFilters({
  searchQuery,
  setSearchQuery,
}: LeaderboardFiltersProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6 space-y-4"
    >
      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full md:w-96">
          <div className="absolute top-0 left-0 -z-10 h-full w-full rounded-md bg-blue-100/50 dark:bg-blue-500/5"></div>
          <div className="group relative">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-blue-600/70 dark:text-blue-400/70" />
            <Input
              placeholder="Search competitors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-gray-300 bg-white pr-9 pl-9 text-gray-700 placeholder:text-gray-500 focus-visible:border-blue-500/50 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus-visible:border-blue-500/50 dark:focus-visible:ring-blue-500/20 dark:focus-visible:ring-offset-slate-900"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-5 w-5 rounded-full p-0 text-gray-400 opacity-70 hover:bg-gray-100 hover:text-gray-700 hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}

            {/* Animated glow effect on focus */}
            <motion.div
              className="absolute -inset-[1px] -z-10 rounded-md opacity-0 blur-sm transition-opacity duration-300 group-focus-within:opacity-100"
              style={{
                background: 'linear-gradient(to right, #3B82F6, #8B5CF6)',
              }}
              animate={{ opacity: searchQuery ? 0.2 : 0 }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tabs
            defaultValue="all"
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-fit"
          >
            <TabsList className="border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/60">
              <TabsTrigger
                value="all"
                className="text-xs data-[state=active]:bg-gray-100 data-[state=active]:text-blue-600 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-400"
              >
                All Players
              </TabsTrigger>
              <TabsTrigger
                value="top10"
                className="text-xs data-[state=active]:bg-gray-100 data-[state=active]:text-yellow-600 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-yellow-400"
              >
                <Trophy className="mr-1 h-3 w-3" />
                Top 10
              </TabsTrigger>
              <TabsTrigger
                value="friends"
                className="text-xs data-[state=active]:bg-gray-100 data-[state=active]:text-green-600 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-green-400"
              >
                <GamepadIcon className="mr-1 h-3 w-3" />
                Friends
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            variant="outline"
            size="sm"
            className={cn(
              'gap-1.5 border-gray-200 bg-white text-xs text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
              showAdvancedFilters &&
                'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/50 dark:bg-blue-950/40 dark:text-blue-400'
            )}
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {showAdvancedFilters && (
              <Sparkles className="ml-1 h-3 w-3 text-blue-600 dark:text-blue-400" />
            )}
          </Button>
        </div>
      </div>

      {showAdvancedFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="relative overflow-hidden border-dashed border-gray-200 bg-white/80 dark:border-slate-700 dark:bg-slate-900/60">
            {/* Animated background glow */}
            <div className="absolute inset-0 -z-10">
              <motion.div
                className="absolute -inset-[100px] opacity-30 blur-3xl"
                style={{
                  background:
                    'radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%)',
                }}
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.1, 0.2, 0.1],
                }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  repeatType: 'reverse',
                  ease: 'easeInOut',
                }}
              />
            </div>

            <CardContent className="grid gap-4 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Score Range
                </label>
                <Select defaultValue="all">
                  <SelectTrigger className="h-8 border-gray-200 bg-white text-xs text-gray-700 ring-offset-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-offset-slate-900">
                    <SelectValue placeholder="All scores" />
                  </SelectTrigger>
                  <SelectContent className="border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <SelectItem value="all">All scores</SelectItem>
                    <SelectItem value="high">High (1000+)</SelectItem>
                    <SelectItem value="medium">Medium (500-999)</SelectItem>
                    <SelectItem value="low">Low (0-499)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Time Period
                </label>
                <Select defaultValue="allTime">
                  <SelectTrigger className="h-8 border-gray-200 bg-white text-xs text-gray-700 ring-offset-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-offset-slate-900">
                    <SelectValue placeholder="All time" />
                  </SelectTrigger>
                  <SelectContent className="border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <SelectItem value="allTime">All time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This week</SelectItem>
                    <SelectItem value="month">This month</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Status
                </label>
                <Select defaultValue="all">
                  <SelectTrigger className="h-8 border-gray-200 bg-white text-xs text-gray-700 ring-offset-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-offset-slate-900">
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent className="border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <SelectItem value="all">All users</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Region
                </label>
                <Select defaultValue="global">
                  <SelectTrigger className="h-8 border-gray-200 bg-white text-xs text-gray-700 ring-offset-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-offset-slate-900">
                    <SelectValue placeholder="Global" />
                  </SelectTrigger>
                  <SelectContent className="border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="americas">Americas</SelectItem>
                    <SelectItem value="europe">Europe</SelectItem>
                    <SelectItem value="asia">Asia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
