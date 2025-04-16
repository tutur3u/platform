'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { X } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import React, { useState } from 'react';

export default function SolutionEdit() {
  const [selectedProblems, setSelectedProblems] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data - replace with actual data fetching
  const problems = [
    { id: '1', title: 'Problem 1' },
    { id: '2', title: 'Problem 2' },
    { id: '3', title: 'Problem 3' },
  ];

  const filteredProblems = problems.filter((problem) =>
    problem.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProblemToggle = (problemId: string) => {
    setSelectedProblems((prev) => {
      if (prev.includes(problemId)) {
        return prev.filter((id) => id !== problemId);
      }
      return [...prev, problemId];
    });
  };

  const handleSelectAll = () => {
    if (selectedProblems.length === filteredProblems.length) {
      setSelectedProblems([]);
    } else {
      setSelectedProblems(filteredProblems.map((p) => p.id));
    }
  };

  return (
    <div className="p-4">
      <p className="mb-4 text-lg font-medium">
        Select the problems to showcase the solution in the front page
      </p>
      <Dialog>
        <DialogTrigger asChild>
          <Button className="flex items-center gap-2">
            Select Problems
            {selectedProblems.length > 0 && (
              <span className="bg-primary-foreground text-primary rounded-full px-2 py-1 text-sm">
                {selectedProblems.length}
              </span>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Select Problems</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Input
                placeholder="Search problems..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
              <Button
                variant="outline"
                onClick={handleSelectAll}
                className="whitespace-nowrap"
              >
                {selectedProblems.length === filteredProblems.length
                  ? 'Deselect All'
                  : 'Select All'}
              </Button>
            </div>

            <Card className="p-4">
              <div className="grid max-h-[400px] gap-4 overflow-y-auto">
                {filteredProblems.map((problem) => (
                  <div
                    key={problem.id}
                    className="hover:bg-accent flex items-center space-x-2 rounded-lg p-2 transition-colors"
                  >
                    <Checkbox
                      id={problem.id}
                      checked={selectedProblems.includes(problem.id)}
                      onCheckedChange={() => handleProblemToggle(problem.id)}
                    />
                    <label
                      htmlFor={problem.id}
                      className="flex-grow cursor-pointer"
                    >
                      {problem.title}
                    </label>
                  </div>
                ))}
                {filteredProblems.length === 0 && (
                  <p className="text-muted-foreground py-4 text-center">
                    No problems found
                  </p>
                )}
              </div>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
