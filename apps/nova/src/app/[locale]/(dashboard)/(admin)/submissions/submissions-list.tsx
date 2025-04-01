'use client';

import { SubmissionFilters } from './filters';
import { SubmissionStatistics } from './statistics';
import { SubmissionTable } from './submission-table';
import { NovaChallenge, NovaProblem, NovaSubmission } from '@tuturuuu/types/db';
import debounce from 'lodash/debounce';
import { useCallback, useEffect, useState } from 'react';

interface SubmissionWithDetails extends NovaSubmission {
  nova_problems: NovaProblem & {
    nova_challenges: NovaChallenge;
  };
  users: {
    display_name: string;
    avatar_url: string;
  };
}

interface SubmissionStats {
  totalCount: number;
  averageScore: number;
  highestScore: number;
  lastSubmissionDate: string;
}

interface ChallengeOption {
  id: string;
  title: string;
}

interface ProblemOption {
  id: string;
  title: string;
  challenge_id: string;
}

export default function SubmissionsList() {
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);

  const [challenges, setChallenges] = useState<ChallengeOption[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<string>('');

  const [problems, setProblems] = useState<ProblemOption[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<string>('');
  const [filteredProblems, setFilteredProblems] = useState<ProblemOption[]>([]);

  const [statsLoading, setStatsLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const PAGE_SIZE = 10;

  // Create a debounced function for search
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setCurrentPage(1);
      fetchSubmissions(query);
      fetchStats(query);
    }, 500),
    []
  );

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      debouncedSearch(searchQuery);
    } else if (searchQuery === '') {
      // When search is cleared, fetch without delay
      setCurrentPage(1);
      fetchSubmissions('');
      fetchStats('');
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchStats();
  }, [selectedChallenge, selectedProblem]);

  useEffect(() => {
    fetchSubmissions();
  }, [
    currentPage,
    sortField,
    sortDirection,
    selectedChallenge,
    selectedProblem,
  ]);

  useEffect(() => {
    // Filter problems based on selected challenge
    if (selectedChallenge) {
      setFilteredProblems(
        problems.filter((problem) => problem.challenge_id === selectedChallenge)
      );
      // Clear problem selection if it's not part of the selected challenge
      if (selectedProblem) {
        const problemBelongsToChallenge = problems.some(
          (p) =>
            p.id === selectedProblem && p.challenge_id === selectedChallenge
        );
        if (!problemBelongsToChallenge) {
          setSelectedProblem('');
        }
      }
    } else {
      setFilteredProblems(problems);
    }
  }, [selectedChallenge, problems, selectedProblem]);

  async function fetchSubmissions(searchOverride?: string) {
    setSubmissionsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: PAGE_SIZE.toString(),
        sortField: sortField,
        sortDirection: sortDirection,
        search: searchOverride !== undefined ? searchOverride : searchQuery,
      });

      if (selectedChallenge) {
        queryParams.append('challengeId', selectedChallenge);
        console.log('Filtering by challenge ID:', selectedChallenge);
      }

      if (selectedProblem) {
        queryParams.append('problemId', selectedProblem);
        console.log('Filtering by problem ID:', selectedProblem);
      }

      const url = `/api/v1/admin/submissions?${queryParams.toString()}`;
      console.log('Fetching submissions with URL:', url);

      const response = await fetch(url);

      if (!response.ok) {
        console.error('Failed to fetch submissions:', await response.text());
        throw new Error('Failed to fetch submissions');
      }

      const data = await response.json();
      console.log('Received submissions data:', data);
      setSubmissions(data.submissions || []);
      setTotalPages(Math.ceil((data.count || 0) / PAGE_SIZE));
    } catch (error) {
      console.error('Error fetching submissions:', error);
      setSubmissions([]);
      setTotalPages(0);
    } finally {
      setSubmissionsLoading(false);
    }
  }

  async function fetchStats(searchOverride?: string) {
    setStatsLoading(true);
    try {
      console.log('Fetching stats with filters:', {
        challenge: selectedChallenge,
        problem: selectedProblem,
        search: searchOverride !== undefined ? searchOverride : searchQuery,
      });

      // Build query parameters to match the current filter state
      const queryParams = new URLSearchParams();

      if (selectedChallenge) {
        queryParams.append('challengeId', selectedChallenge);
      }

      if (selectedProblem) {
        queryParams.append('problemId', selectedProblem);
      }

      if (searchOverride !== undefined) {
        if (searchOverride) queryParams.append('search', searchOverride);
      } else if (searchQuery) {
        queryParams.append('search', searchQuery);
      }

      // Only append the query string if we have parameters
      const queryString = queryParams.toString();
      const url = `/api/v1/admin/submissions/stats${queryString ? `?${queryString}` : ''}`;

      console.log('Fetching stats with URL:', url);
      const response = await fetch(url, {
        // Add cache: 'no-store' to prevent caching
        cache: 'no-store',
      });

      if (!response.ok) {
        console.error('Stats API error:', await response.text());
        throw new Error('Failed to fetch submission statistics');
      }

      const data = await response.json();
      console.log('Received stats data:', data);
      setStats(data);
    } catch (error) {
      console.error('Error fetching submission statistics:', error);
    } finally {
      setStatsLoading(false);
    }
  }

  async function fetchFilters() {
    try {
      console.log('Fetching filters...');

      // Fetch challenges
      const challengesRes = await fetch('/api/v1/challenges');
      if (challengesRes.ok) {
        const challengesData = await challengesRes.json();
        console.log('Raw challenges data:', challengesData);

        // Ensure we handle the data format correctly
        if (Array.isArray(challengesData)) {
          const formattedChallenges = challengesData.map((challenge) => ({
            id: challenge.id,
            title: challenge.title || `Challenge ${challenge.id}`,
          }));
          console.log('Formatted challenges:', formattedChallenges);
          setChallenges(formattedChallenges);
        } else {
          console.error('Challenges data is not an array:', challengesData);
          setChallenges([]);
        }
      } else {
        console.error(
          'Failed to fetch challenges:',
          await challengesRes.text()
        );
        setChallenges([]);
      }

      // Fetch problems with more detailed information
      const problemsRes = await fetch('/api/v1/problems?includeChallenge=true');
      if (problemsRes.ok) {
        const problemsData = await problemsRes.json();
        console.log('Raw problems data:', problemsData);

        // Ensure we handle the data format correctly
        if (Array.isArray(problemsData)) {
          const formattedProblems = problemsData.map((problem) => ({
            id: problem.id,
            title: problem.title || `Problem ${problem.id}`,
            challenge_id: problem.challenge_id,
          }));
          console.log('Formatted problems:', formattedProblems);
          setProblems(formattedProblems);
          setFilteredProblems(formattedProblems);
        } else {
          console.error('Problems data is not an array:', problemsData);
          setProblems([]);
          setFilteredProblems([]);
        }
      } else {
        console.error('Failed to fetch problems:', await problemsRes.text());
        setProblems([]);
        setFilteredProblems([]);
      }
    } catch (error) {
      console.error('Error fetching filters:', error);
      setChallenges([]);
      setProblems([]);
      setFilteredProblems([]);
    }
  }

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getScoreColor(score: number) {
    if (score >= 8)
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (score >= 5)
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
  }

  function handleChallengeChange(value: string) {
    setSelectedChallenge(value === 'all' ? '' : value);
    setCurrentPage(1); // Reset to first page when filter changes
  }

  function handleProblemChange(value: string) {
    setSelectedProblem(value === 'all' ? '' : value);
    setCurrentPage(1); // Reset to first page when filter changes
  }

  function handleClearFilters() {
    setSelectedChallenge('');
    setSelectedProblem('');
    setCurrentPage(1);
  }

  return (
    <>
      {/* Stats Section */}
      <SubmissionStatistics
        stats={stats}
        statsLoading={statsLoading}
        formatDate={formatDate}
      />

      {/* Filters Section */}
      <SubmissionFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedChallenge={selectedChallenge}
        handleChallengeChange={handleChallengeChange}
        selectedProblem={selectedProblem}
        handleProblemChange={handleProblemChange}
        handleClearFilters={handleClearFilters}
        challenges={challenges}
        filteredProblems={filteredProblems}
      />

      {/* Table/Grid Section */}
      <SubmissionTable
        submissions={submissions}
        loading={submissionsLoading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        viewMode={viewMode}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        sortField={sortField}
        sortDirection={sortDirection}
        handleSort={handleSort}
        formatDate={formatDate}
        getScoreColor={getScoreColor}
      />
    </>
  );
}
