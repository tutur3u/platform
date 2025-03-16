import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import {
  ArrowLeftRight,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code,
  CopyCheck,
  Eye,
  FileText,
  Keyboard,
  Maximize2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface TestCase {
  id: string;
  input: string;
  expected_output?: string;
  actual_output?: string;
  status?: 'success' | 'pending' | 'fail';
}

interface TestCaseComponentProps {
  testcases: TestCase[];
}

export default function TestCaseComponent({
  testcases,
}: TestCaseComponentProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [openTestCases, setOpenTestCases] = useState<Record<string, boolean>>(
    {}
  );
  const [showDiffView, setShowDiffView] = useState(false);
  const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(
    null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [autoExpand, setAutoExpand] = useState(false);
  const [activeTestCaseIndex, setActiveTestCaseIndex] = useState<number | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');

  // For demo purposes, assign random statuses and outputs to test cases
  const testcasesWithStatus = testcases.map((testcase, index) => {
    // This is just for demonstration - in a real app, you'd get the status from the API
    const statuses = ['success', 'pending', 'fail'] as const;
    const randomStatus = statuses[index % statuses.length];

    // Generate mock expected and actual outputs
    const expectedOutput =
      testcase.expected_output || `Expected output for test case ${index + 1}`;
    const actualOutput =
      testcase.actual_output ||
      (randomStatus === 'success'
        ? expectedOutput
        : randomStatus === 'pending'
          ? 'Processing...'
          : `Failed output for test case ${index + 1}${index % 2 === 0 ? ' with some differences' : ''}`);

    return {
      ...testcase,
      status: testcase.status || randomStatus,
      expected_output: expectedOutput,
      actual_output: actualOutput,
    };
  });

  // Toggle a specific test case's expanded state
  const toggleTestCase = (id: string) => {
    setOpenTestCases((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Expand all test cases
  const expandAll = () => {
    const newState: Record<string, boolean> = {};
    testcasesWithStatus.forEach((testcase, index) => {
      newState[testcase.id || `test-${index}`] = true;
    });
    setOpenTestCases(newState);
  };

  // Collapse all test cases
  const collapseAll = () => {
    setOpenTestCases({});
  };

  const successTestcases = testcasesWithStatus.filter(
    (tc) => tc.status === 'success'
  );
  const pendingTestcases = testcasesWithStatus.filter(
    (tc) => tc.status === 'pending'
  );
  const failTestcases = testcasesWithStatus.filter(
    (tc) => tc.status === 'fail'
  );

  const getStatusPercentage = () => {
    if (testcasesWithStatus.length === 0) return 0;
    return (successTestcases.length / testcasesWithStatus.length) * 100;
  };

  // Simple diff highlighting (in a real app, you'd use a proper diff library)
  const highlightDifferences = (expected: string, actual: string) => {
    if (!expected || !actual || actual === 'Processing...') return actual;

    // This is a very simple implementation - in a real app, use a proper diff library
    const words1 = expected.split(' ');
    const words2 = actual.split(' ');

    return words2
      .map((word, i) => {
        const isMatch = words1[i] === word;
        return isMatch
          ? word
          : `<span class="bg-red-100 dark:bg-red-900/30 px-1 rounded">${word}</span>`;
      })
      .join(' ');
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when dialog is open
      if (isDialogOpen && selectedTestCase) {
        // ESC key to close dialog is handled by the Dialog component

        // Arrow keys for navigation between test cases
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          navigateToNextTestCase();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          navigateToPrevTestCase();
        }

        // Toggle diff view with 'd' key
        else if (e.key === 'd') {
          e.preventDefault();
          setShowDiffView(!showDiffView);
        }

        // Run test with 'r' key
        else if (e.key === 'r') {
          e.preventDefault();
          // Would trigger test rerun in a real app
          console.log('Rerunning test case');
        }
      } else {
        // Global shortcuts (when dialog is closed)
        if (e.ctrlKey || e.metaKey) {
          // Ctrl/Cmd + E to expand all
          if (e.key === 'e') {
            e.preventDefault();
            expandAll();
          }
          // Ctrl/Cmd + C to collapse all
          else if (e.key === 'c') {
            e.preventDefault();
            collapseAll();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDialogOpen, selectedTestCase, showDiffView]);

  // Navigate to next test case in the dialog
  const navigateToNextTestCase = () => {
    if (!selectedTestCase) return;

    const currentIndex = testcasesWithStatus.findIndex(
      (tc) => tc.id === selectedTestCase.id
    );

    if (currentIndex < testcasesWithStatus.length - 1) {
      const nextTestCase = testcasesWithStatus[currentIndex + 1];
      if (nextTestCase) {
        setSelectedTestCase(nextTestCase as TestCase);
        setActiveTestCaseIndex(currentIndex + 1);
      }
    }
  };

  // Navigate to previous test case in the dialog
  const navigateToPrevTestCase = () => {
    if (!selectedTestCase) return;

    const currentIndex = testcasesWithStatus.findIndex(
      (tc) => tc.id === selectedTestCase.id
    );

    if (currentIndex > 0) {
      const prevTestCase = testcasesWithStatus[currentIndex - 1];
      if (prevTestCase) {
        setSelectedTestCase(prevTestCase as TestCase);
        setActiveTestCaseIndex(currentIndex - 1);
      }
    }
  };

  // Update openDetailView to set the active index
  const openDetailView = (testcase: TestCase) => {
    setSelectedTestCase(testcase);
    setIsDialogOpen(true);
    const index = testcasesWithStatus.findIndex((tc) => tc.id === testcase.id);
    setActiveTestCaseIndex(index);
  };

  // Filter test cases based on search query
  const filterTestCases = (testcases: TestCase[]) => {
    if (!searchQuery.trim()) return testcases;

    const query = searchQuery.toLowerCase();
    return testcases.filter(
      (testcase) =>
        testcase.input.toLowerCase().includes(query) ||
        (testcase.expected_output &&
          testcase.expected_output.toLowerCase().includes(query)) ||
        (testcase.actual_output &&
          testcase.actual_output.toLowerCase().includes(query))
    );
  };

  const filteredTestcases = filterTestCases(testcasesWithStatus);
  const filteredSuccessTestcases = filterTestCases(successTestcases);
  const filteredPendingTestcases = filterTestCases(pendingTestcases);
  const filteredFailTestcases = filterTestCases(failTestcases);

  const renderTestCase = (testcase: TestCase, index: number) => {
    const isOpen = openTestCases[testcase.id || `test-${index}`] || false;

    // Auto-expand failed test cases if the setting is enabled
    if (autoExpand && testcase.status === 'fail' && !isOpen) {
      toggleTestCase(testcase.id || `test-${index}`);
    }

    return (
      <Card
        key={testcase.id || index}
        className="mb-4 overflow-hidden transition-all duration-200 hover:shadow-md"
      >
        <CardHeader
          className={cn(
            'pb-3',
            testcase.status === 'success'
              ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
              : testcase.status === 'pending'
                ? 'bg-amber-50/50 dark:bg-amber-950/20'
                : 'bg-red-50/50 dark:bg-red-950/20'
          )}
        >
          <Collapsible
            open={isOpen}
            onOpenChange={() => toggleTestCase(testcase.id || `test-${index}`)}
          >
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2 p-0 hover:bg-transparent"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <CardTitle className="flex items-center gap-2 text-base">
                    {testcase.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : testcase.status === 'pending' ? (
                      <Clock className="h-4 w-4 text-amber-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    Test Case {index + 1}
                  </CardTitle>
                </Button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    testcase.status === 'success'
                      ? 'success'
                      : testcase.status === 'pending'
                        ? 'warning'
                        : 'destructive'
                  }
                >
                  {testcase.status === 'success'
                    ? 'Success'
                    : testcase.status === 'pending'
                      ? 'Pending'
                      : 'Failed'}
                </Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openDetailView(testcase)}
                      >
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>View full details</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Rerun this test case</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <CollapsibleContent className="mt-4 space-y-4">
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  Input
                </h4>
                <div className="relative rounded-md bg-muted p-3 font-mono text-sm">
                  <div className="absolute top-2 right-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              navigator.clipboard.writeText(testcase.input);
                            }}
                          >
                            <CopyCheck className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Copy to clipboard</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {testcase.input}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    Expected Output
                  </h4>
                  <div className="rounded-md bg-muted p-3 font-mono text-sm">
                    {testcase.expected_output}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                    {testcase.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : testcase.status === 'pending' ? (
                      <Clock className="h-4 w-4 text-amber-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    Actual Output
                  </h4>
                  <div
                    className={cn(
                      'rounded-md p-3 font-mono text-sm',
                      testcase.status === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/30'
                        : testcase.status === 'pending'
                          ? 'bg-amber-50 dark:bg-amber-950/30'
                          : 'bg-red-50 dark:bg-red-950/30'
                    )}
                  >
                    {showDiffView && testcase.status === 'fail' ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: highlightDifferences(
                            testcase.expected_output || '',
                            testcase.actual_output || ''
                          ),
                        }}
                      />
                    ) : (
                      testcase.actual_output
                    )}
                  </div>
                </div>
              </div>

              {testcase.status === 'fail' && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                    <XCircle className="h-4 w-4" />
                    Failure Details
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    The output doesn't match the expected result. Check for
                    differences in formatting, whitespace, or content.
                  </p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </CardHeader>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Test Cases</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            {successTestcases.length}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3 text-amber-500" />
            {pendingTestcases.length}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <XCircle className="h-3 w-3 text-red-500" />
            {failTestcases.length}
          </Badge>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Test Progress</span>
              <span className="text-sm text-muted-foreground">
                {successTestcases.length}/{testcasesWithStatus.length} passed
              </span>
            </div>
            <Progress
              value={getStatusPercentage()}
              max={100}
              className="h-2"
              style={
                {
                  '--progress-indicator-color':
                    getStatusPercentage() === 100
                      ? 'rgb(16 185 129)' // emerald-500
                      : getStatusPercentage() > 50
                        ? 'rgb(245 158 11)' // amber-500
                        : 'rgb(239 68 68)', // red-500
                } as React.CSSProperties
              }
            />
          </div>
        </CardContent>
        <CardFooter className="border-t bg-muted/50 px-0 py-3">
          <div className="flex w-full flex-col items-center justify-between">
            <div className="flex items-center gap-4 px-6">
              <span className="text-xs text-muted-foreground">
                {pendingTestcases.length > 0
                  ? `${pendingTestcases.length} test cases still running`
                  : 'All test cases completed'}
              </span>

              <div className="flex items-center space-x-2">
                <Switch
                  id="auto-expand"
                  checked={autoExpand}
                  onCheckedChange={setAutoExpand}
                />
                <Label htmlFor="auto-expand" className="text-xs">
                  Auto-expand failures
                </Label>
              </div>
            </div>

            <Separator className="my-2" />

            <div className="flex items-center gap-2 px-6">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={expandAll}
              >
                <ChevronDown className="h-3 w-3" />
                <span>Expand All</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={collapseAll}
              >
                <ChevronRight className="h-3 w-3" />
                <span>Collapse All</span>
              </Button>
              <Button variant="outline" size="sm" className="gap-1">
                <RefreshCw className="h-3 w-3" />
                <span>Run All Tests</span>
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search test cases by input or output..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery('')}
            className="h-10"
          >
            <XCircle className="h-4 w-4" />
            <span className="ml-2">Clear</span>
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all" className="text-xs">
            All ({filteredTestcases.length})
            {filteredTestcases.length !== testcasesWithStatus.length && (
              <span className="ml-1 text-xs text-muted-foreground">
                of {testcasesWithStatus.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="success" className="text-xs">
            Success ({filteredSuccessTestcases.length})
            {filteredSuccessTestcases.length !== successTestcases.length && (
              <span className="ml-1 text-xs text-muted-foreground">
                of {successTestcases.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">
            Pending ({filteredPendingTestcases.length})
            {filteredPendingTestcases.length !== pendingTestcases.length && (
              <span className="ml-1 text-xs text-muted-foreground">
                of {pendingTestcases.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="fail" className="text-xs">
            Failed ({filteredFailTestcases.length})
            {filteredFailTestcases.length !== failTestcases.length && (
              <span className="ml-1 text-xs text-muted-foreground">
                of {failTestcases.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {filteredTestcases.length > 0 ? (
            filteredTestcases.map((testcase, index) =>
              renderTestCase(testcase, index)
            )
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Search className="mb-2 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-medium">No matching test cases</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting your search query to find what you're looking for.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSearchQuery('')}
              >
                Clear search
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="success" className="mt-4">
          {filteredSuccessTestcases.length > 0 ? (
            filteredSuccessTestcases.map((testcase, index) =>
              renderTestCase(testcase, index)
            )
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Search className="mb-2 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-medium">
                No matching successful test cases
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting your search query to find what you're looking for.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSearchQuery('')}
              >
                Clear search
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <XCircle className="mb-2 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-medium">No successful test cases</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                None of your test cases have passed yet.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          {filteredPendingTestcases.length > 0 ? (
            filteredPendingTestcases.map((testcase, index) =>
              renderTestCase(testcase, index)
            )
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Search className="mb-2 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-medium">
                No matching pending test cases
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting your search query to find what you're looking for.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSearchQuery('')}
              >
                Clear search
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <CheckCircle className="mb-2 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-medium">No pending test cases</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                All test cases have been evaluated.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="fail" className="mt-4">
          {filteredFailTestcases.length > 0 ? (
            filteredFailTestcases.map((testcase, index) =>
              renderTestCase(testcase, index)
            )
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Search className="mb-2 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-medium">
                No matching failed test cases
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting your search query to find what you're looking for.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSearchQuery('')}
              >
                Clear search
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <CheckCircle className="mb-2 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-medium">No failed test cases</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                All test cases are either successful or pending.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detailed Test Case Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Test Case Details
              {activeTestCaseIndex !== null && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {activeTestCaseIndex + 1} of {testcasesWithStatus.length}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Detailed view of the test case inputs and outputs
            </DialogDescription>
          </DialogHeader>

          {selectedTestCase && (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between">
                <Badge
                  variant={
                    selectedTestCase.status === 'success'
                      ? 'success'
                      : selectedTestCase.status === 'pending'
                        ? 'warning'
                        : 'destructive'
                  }
                  className="px-3 py-1.5 text-sm"
                >
                  {selectedTestCase.status === 'success'
                    ? 'Success'
                    : selectedTestCase.status === 'pending'
                      ? 'Pending'
                      : 'Failed'}
                </Badge>

                <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="dialog-diff-view"
                      checked={showDiffView}
                      onCheckedChange={setShowDiffView}
                    />
                    <Label htmlFor="dialog-diff-view" className="text-sm">
                      Show Diff View{' '}
                      <kbd className="ml-1 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                        D
                      </kbd>
                    </Label>
                  </div>

                  <Button variant="outline" size="sm" className="gap-1">
                    <RefreshCw className="h-4 w-4" />
                    <span>Rerun Test</span>
                    <kbd className="ml-1 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                      R
                    </kbd>
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateToPrevTestCase}
                  disabled={activeTestCaseIndex === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                  <kbd className="ml-1 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                    ←
                  </kbd>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateToNextTestCase}
                  disabled={
                    activeTestCaseIndex === testcasesWithStatus.length - 1
                  }
                  className="gap-1"
                >
                  Next
                  <kbd className="ml-1 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                    →
                  </kbd>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div>
                <h3 className="mb-2 text-lg font-medium">Input</h3>
                <div className="relative rounded-md bg-muted p-4 font-mono text-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedTestCase.input);
                    }}
                  >
                    <CopyCheck className="mr-2 h-3 w-3" />
                    Copy
                  </Button>
                  <pre className="whitespace-pre-wrap">
                    {selectedTestCase.input}
                  </pre>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-lg font-medium">Expected Output</h3>
                  <div className="rounded-md bg-muted p-4 font-mono text-sm">
                    <pre className="whitespace-pre-wrap">
                      {selectedTestCase.expected_output}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-lg font-medium">
                    Actual Output
                    {selectedTestCase.status === 'success' ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    ) : selectedTestCase.status === 'pending' ? (
                      <Clock className="h-5 w-5 text-amber-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </h3>
                  <div
                    className={cn(
                      'rounded-md p-4 font-mono text-sm',
                      selectedTestCase.status === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/30'
                        : selectedTestCase.status === 'pending'
                          ? 'bg-amber-50 dark:bg-amber-950/30'
                          : 'bg-red-50 dark:bg-red-950/30'
                    )}
                  >
                    {showDiffView && selectedTestCase.status === 'fail' ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: highlightDifferences(
                            selectedTestCase.expected_output || '',
                            selectedTestCase.actual_output || ''
                          ),
                        }}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap">
                        {selectedTestCase.actual_output}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              {selectedTestCase.status === 'fail' && (
                <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
                  <h3 className="mb-2 flex items-center gap-2 font-medium text-red-700 dark:text-red-400">
                    <XCircle className="h-5 w-5" />
                    Failure Analysis
                  </h3>
                  <p className="text-red-700 dark:text-red-400">
                    The output doesn't match the expected result. Here are some
                    possible issues:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-red-700 dark:text-red-400">
                    <li>Check for differences in formatting or whitespace</li>
                    <li>
                      Verify that all required elements are present in the
                      output
                    </li>
                    <li>
                      Ensure the prompt is correctly handling the input
                      parameters
                    </li>
                    <li>
                      Consider edge cases that might be affecting the result
                    </li>
                  </ul>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    // In a real app, this would navigate to the prompt editor with this test case
                    setIsDialogOpen(false);
                  }}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  Test with Custom Prompt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Keyboard shortcuts help tooltip */}
      <div className="fixed right-4 bottom-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 rounded-full"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="w-80">
              <div className="space-y-2 p-2">
                <h4 className="font-medium">Keyboard Shortcuts</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                      Ctrl/⌘ + E
                    </kbd>
                    <span>Expand all test cases</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                      Ctrl/⌘ + C
                    </kbd>
                    <span>Collapse all test cases</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                      ←/↑
                    </kbd>
                    <span>Previous test case</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                      →/↓
                    </kbd>
                    <span>Next test case</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                      D
                    </kbd>
                    <span>Toggle diff view</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                      R
                    </kbd>
                    <span>Rerun test</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                      Esc
                    </kbd>
                    <span>Close dialog</span>
                  </div>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
