'use client';

import { Clock, FileText, Search, X } from '@tuturuuu/icons';
import type { RecordingTranscript } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface TranscriptViewerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: RecordingTranscript | null;
  sessionId: string;
  sessionCreatedAt: string;
}

export function TranscriptViewer({
  isOpen,
  onOpenChange,
  transcript,
  sessionId,
  sessionCreatedAt,
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // Type guard for segments
  const isSegmentsArray = (
    segments: unknown
  ): segments is Array<{ text: string; start: number; end: number }> => {
    return (
      Array.isArray(segments) &&
      segments.every(
        (s) =>
          typeof s === 'object' &&
          s !== null &&
          typeof s.text === 'string' &&
          typeof s.start === 'number' &&
          typeof s.end === 'number'
      )
    );
  };

  // Filter segments based on search query
  const segments = transcript?.segments;
  const validSegments = isSegmentsArray(segments) ? segments : [];
  const filteredSegments = validSegments.filter((segment) =>
    segment.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Highlight search matches in text
  const highlightSearchMatches = (text: string, query: string) => {
    if (!query.trim()) return text;

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark
          key={index}
          className="rounded bg-yellow-200 px-1 dark:bg-yellow-800"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const handleCopyTranscript = () => {
    let text = '';
    if (validSegments.length > 0) {
      // Use filtered segments if search is active, otherwise use all segments
      const segmentsToUse = searchQuery ? filteredSegments : validSegments;
      text = segmentsToUse
        .map((s) => `[${formatTime(s.start)}] ${s.text}`)
        .join('\n\n');
    } else {
      text = transcript?.text || '';
    }

    navigator.clipboard.writeText(text);
    toast.success(
      searchQuery && validSegments.length > 0
        ? `${filteredSegments.length} filtered segments copied to clipboard`
        : 'Transcript copied to clipboard'
    );
  };

  const handleExportTranscript = () => {
    if (!transcript) return;

    const exportData = {
      transcript: transcript.text,
      segments: transcript.segments || [],
      language: transcript.language,
      duration: transcript.duration_in_seconds,
      recordingDate: sessionCreatedAt,
      sessionId: sessionId,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${sessionId}-${new Date(sessionCreatedAt).toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Transcript exported');
  };

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setSearchQuery(''); // Clear search when closing
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Meeting Transcript
          </DialogTitle>
          <DialogDescription>
            AI-generated transcript from the recording session
          </DialogDescription>
        </DialogHeader>

        {transcript ? (
          <div className="flex flex-1 flex-col space-y-4 overflow-hidden">
            {/* Transcript Info Bar */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3 text-sm">
              {transcript.language && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">
                    Language:
                  </span>
                  <span className="rounded bg-dynamic-blue/10 px-2 py-1 font-medium text-dynamic-blue text-xs uppercase">
                    {transcript.language}
                  </span>
                </div>
              )}
              {transcript.duration_in_seconds && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-muted-foreground">
                    Duration:
                  </span>
                  <span>{formatTime(transcript.duration_in_seconds)}</span>
                </div>
              )}
            </div>

            {/* Search Bar */}
            {validSegments.length > 0 && (
              <div className="relative">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                <Input
                  placeholder="Search transcript..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 pl-10"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 transform p-0"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}

            {/* Transcript Content */}
            <div className="flex-1 overflow-y-auto">
              {validSegments.length > 0 ? (
                /* Segmented Transcript with Timestamps */
                <div className="space-y-3">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <h4 className="font-medium text-muted-foreground text-sm">
                        Transcript with Timestamps
                      </h4>
                      <div className="text-muted-foreground text-xs">
                        {searchQuery
                          ? `${filteredSegments.length} of ${validSegments.length} segments`
                          : `${validSegments.length} segments`}
                      </div>
                    </div>
                  </div>

                  {searchQuery && filteredSegments.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      <p>
                        No segments found matching &quot;{searchQuery}&quot;
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(searchQuery ? filteredSegments : validSegments).map(
                        (segment, index) => (
                          <div
                            key={searchQuery ? `search-${index}` : index}
                            className="group flex gap-4 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/20"
                          >
                            {/* Timestamp */}
                            <div className="w-24 shrink-0 font-mono text-muted-foreground text-xs">
                              <div className="sticky top-0">
                                <div className="font-medium">
                                  {formatTime(segment.start)}
                                </div>
                                <div className="opacity-60">
                                  -{formatTime(segment.end)}
                                </div>
                              </div>
                            </div>

                            {/* Segment Text */}
                            <div className="flex-1 text-sm leading-relaxed">
                              {searchQuery
                                ? highlightSearchMatches(
                                    segment.text,
                                    searchQuery
                                  )
                                : segment.text}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Full Text Transcript */
                <div className="space-y-3">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="font-medium text-muted-foreground text-sm">
                      Full Transcript
                    </h4>
                    {/* Search Bar for Full Text */}
                    <div className="ml-4 max-w-sm flex-1">
                      <div className="relative">
                        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                        <Input
                          placeholder="Search transcript..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-8 pr-10 pl-10 text-sm"
                        />
                        {searchQuery && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2 transform p-0"
                            onClick={() => setSearchQuery('')}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {searchQuery
                        ? highlightSearchMatches(transcript.text, searchQuery)
                        : transcript.text}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t pt-3">
              <div className="text-muted-foreground text-xs">
                Transcript generated by AI • Review for accuracy
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyTranscript}
                >
                  Copy{' '}
                  {searchQuery && validSegments.length > 0 ? 'Filtered' : 'All'}{' '}
                  Text
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportTranscript}
                >
                  Export JSON
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center py-12">
            <div className="space-y-3 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="font-semibold text-lg">No Transcript Available</h3>
              <p className="max-w-sm text-muted-foreground">
                No transcript is available for this recording session. You can
                generate one by clicking the &quot;Transcribe&quot; button.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
