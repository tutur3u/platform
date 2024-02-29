'use client';
import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Define named function for handleSearchQuery
const handleSearchQuery = (updatedParams: any) => {
  const currentUrl = window.location.href;
  const baseUrl = currentUrl.split('?')[0];
  const searchQuery = new URLSearchParams(updatedParams).toString();
 {/* rerender only the plan component not the whole page */}
  window.location.href = `${baseUrl}?${searchQuery}`;
};

export default function SearchFilter() {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - 2019 },
    (_, i) => currentYear - i
  );

  {/* COMBINE WITH PARAMS FROM PAGE.TSX */}
  const [searchParams, setSearchParams] = useState({
    q: '',
    sort: '',
    month: '',
    year: '',
    desc: '',
  });
  // Function to get the value of the 'desc' parameter from the URL
  const getParams = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams;
  };

  const [selectedFilter, setSelectedFilter] = useState(
    getParams().get('desc') || ''
  );

  // Define state variables
  const [qValue, setQValue] = useState('');
  const [monthValue, setMonthValue] = useState('');
  const [yearValue, setYearValue] = useState('');

  // Event handler for select specific month and year
  const handleApply = useCallback(
    (selectedFilter: string) => {
      setSelectedFilter(`Within ${monthValue} ${yearValue}`);
      handleSearchQuery({
        ...searchParams,
        month: monthValue,
        year: yearValue,
        desc: selectedFilter,
      });
    },
    [monthValue, yearValue, selectedFilter]
  );

  // Event handler for sorting
  const handleSort = useCallback((sortOpt: string, selectedFilter: string) => {
    console.log(selectedFilter);
    handleSearchQuery({ ...searchParams, sort: sortOpt, desc: selectedFilter });
  }, []);

  // Event handler for search
  const handleSearch = useCallback((q: string) => {
    handleSearchQuery({ ...searchParams, q: q, desc: selectedFilter });
  }, []);

  return (
    <div className="flex w-full flex-row items-center justify-between py-5">
      <div className="filter">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Filter by: {selectedFilter}{' '}
              <ChevronDown className="ml-auto h-4 w-4 " />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => {
                setSelectedFilter('My favorites');
                handleSort('fav', 'My favorites');
              }}
            >
              <DropdownMenuLabel>My favorites</DropdownMenuLabel>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => {
                setSelectedFilter('Lastest Plans');
                handleSort('desc', 'Lastest Plans');
              }}
            >
              <DropdownMenuLabel>Latest</DropdownMenuLabel>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => {
                setSelectedFilter('Earliest Plans');
                handleSort('asc', 'Earliest Plans');
              }}
            >
              <DropdownMenuLabel>Earliest</DropdownMenuLabel>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => {
                setSelectedFilter('Within 7 days');
                handleSort('7days', 'Within 7 days');
              }}
            >
              <DropdownMenuLabel>Within 7 days</DropdownMenuLabel>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Dialog>
                <DialogTrigger
                  asChild
                  onClick={(e) => {
                    e.stopPropagation(); // Stop event propagation
                  }}
                >
                  <DropdownMenuLabel>Within a specific month</DropdownMenuLabel>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="month" className="text-right font-bold">
                        Month
                      </Label>
                      <Select onValueChange={(value) => setMonthValue(value)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue
                            placeholder="Select a month"
                            className="w-max"
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {months.map((month, index) => (
                            <SelectItem key={index} value={month}>
                              {month}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="year" className="text-right font-bold">
                        Year
                      </Label>
                      <Select onValueChange={(value) => setYearValue(value)}>
                        <SelectTrigger value="" className="w-[180px]">
                          <SelectValue placeholder="Select a year" />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((year, index) => (
                            <SelectItem key={index} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() =>
                        handleApply(`Within ${monthValue} ${yearValue}`)
                      }
                    >
                      Apply
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="search flex gap-4">
        <Input
          placeholder={getParams().get('q') || 'Search for plans'}
          className="w-full max-w-md"
          value={qValue}
          onChange={(e) => setQValue(e.target.value)}
        />
        <Button onClick={() => handleSearch(qValue)}>Search</Button>
      </div>
    </div>
  );
}
