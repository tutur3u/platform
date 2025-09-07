'use client';

import {
  type EmailDraft,
  emailDraftSchema,
} from '../../../../../api/ai/email-draft/schema';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { ChevronDown, ChevronUp, Sparkles, Wand2 } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type { JSONContent } from '@tuturuuu/ui/tiptap';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import Textarea from 'react-textarea-autosize';

interface AIEmailDrafterProps {
  onDraftGenerated: (draft: { subject: string; content: JSONContent }) => void;
  disabled?: boolean;
  initialRecipients?: string[];
  initialContext?: string;
  userEmail?: string;
  userDisplayName?: string;
}

export function AIEmailDrafter({
  onDraftGenerated,
  disabled = false,
  initialRecipients = [],
  initialContext = '',
  userEmail,
  userDisplayName,
}: AIEmailDrafterProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState(initialContext);
  const [recipients, setRecipients] = useState(initialRecipients.join(', '));
  const [purpose, setPurpose] = useState('');
  const [tone, setTone] = useState<
    'formal' | 'casual' | 'friendly' | 'professional'
  >('professional');
  const [revisionInstructions, setRevisionInstructions] = useState('');
  const [isRevising, setIsRevising] = useState(false);

  const [object, setObject] = useState<EmailDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateDraft = async (isRevision = false) => {
    const promptData = {
      context: context.trim() || 'General communication',
      recipients: recipients.trim() || 'Not specified',
      purpose: purpose.trim() || 'General communication',
      tone,
      userEmail,
      userDisplayName,
      existingContent: isRevision && object ? object.content : undefined,
      revisionInstructions: isRevision
        ? revisionInstructions.trim()
        : undefined,
    };

    if (isRevision) {
      setIsRevising(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    if (!isRevision) {
      setObject(null);
    }

    try {
      const response = await fetch('/api/ai/email-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(promptData),
      });

      if (!response.ok) {
        throw new Error('Failed to generate email draft');
      }

      const data = await response.json();

      // Validate the response against the schema
      const validatedData = emailDraftSchema.parse(data);
      setObject(validatedData);
    } catch (err) {
      console.error('Error generating draft:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to generate email draft'
      );
    } finally {
      setIsLoading(false);
      setIsRevising(false);
    }
  };

  const convertTextToTiptapContent = (text: string): JSONContent => {
    if (!text.trim()) {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };
    }

    // Split by double line breaks to get main paragraphs
    const mainParagraphs = text.split(/\n\s*\n/).filter((p) => p.trim());

    const content: JSONContent[] = [];

    mainParagraphs.forEach((paragraph) => {
      // Split each paragraph by single line breaks
      const lines = paragraph.split('\n').filter((line) => line.trim());

      if (lines.length === 1) {
        // Single line - create one paragraph
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: lines[0]?.trim() || '' }],
        });
      } else {
        // Multiple lines - analyze the structure
        const processedLines: string[] = [];
        let currentLine = '';

        lines.forEach((line) => {
          const trimmedLine = line.trim();

          // If this line is very short (likely a signature element) or contains email
          const isShortLine = trimmedLine.length < 50;
          const hasEmail = trimmedLine.includes('@');
          const isSignatureElement =
            /^(Sincerely|Best regards|Thank you|Regards|Yours truly|Kind regards|Respectfully)/i.test(
              trimmedLine
            );

          if (isShortLine || hasEmail || isSignatureElement) {
            // If we have accumulated content, push it as a paragraph
            if (currentLine.trim()) {
              processedLines.push(currentLine.trim());
              currentLine = '';
            }
            // Add this line as a separate paragraph
            processedLines.push(trimmedLine);
          } else {
            // Regular content line - accumulate
            if (currentLine) {
              currentLine += ' ' + trimmedLine;
            } else {
              currentLine = trimmedLine;
            }
          }
        });

        // Don't forget the last accumulated line
        if (currentLine.trim()) {
          processedLines.push(currentLine.trim());
        }

        // Convert processed lines to paragraphs
        processedLines.forEach((line) => {
          if (line.trim()) {
            content.push({
              type: 'paragraph',
              content: [{ type: 'text', text: line.trim() }],
            });
          }
        });
      }
    });

    return {
      type: 'doc',
      content:
        content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
    };
  };

  const handleApplyDraft = () => {
    if (object?.subject && object?.content) {
      // Convert plain text content to Tiptap JSON format
      const content = convertTextToTiptapContent(object.content);

      onDraftGenerated({
        subject: object.subject,
        content,
      });

      // Close the AI drafter after applying
      setIsOpen(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex w-full items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5 text-left font-medium text-muted-foreground text-sm transition-all hover:bg-muted/40 hover:text-foreground"
          disabled={disabled}
        >
          <span className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary/10">
              <Sparkles className="h-3 w-3" />
            </div>
            <span className="text-sm">
              {t('mail.ai_draft', { default: 'AI Email Draft' })}
            </span>
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 transition-transform" />
          ) : (
            <ChevronDown className="h-4 w-4 transition-transform" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wand2 className="h-4 w-4" />
              {t('mail.ai_draft_title', { default: 'AI Email Assistant' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Context Input */}
            <div className="space-y-2">
              <Label htmlFor="ai-context">
                {t('mail.context', { default: 'Context' })}
              </Label>
              <Textarea
                id="ai-context"
                placeholder={t('mail.context_placeholder', {
                  default: 'Describe what you want to communicate...',
                })}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                disabled={isLoading}
                minRows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Recipients Input */}
            <div className="space-y-2">
              <Label htmlFor="ai-recipients">
                {t('mail.recipients', { default: 'Recipients' })}
              </Label>
              <Input
                id="ai-recipients"
                placeholder={t('mail.recipients_placeholder', {
                  default: 'Who are you writing to?',
                })}
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Purpose Input */}
            <div className="space-y-2">
              <Label htmlFor="ai-purpose">
                {t('mail.purpose', { default: 'Purpose' })}
              </Label>
              <Input
                id="ai-purpose"
                placeholder={t('mail.purpose_placeholder', {
                  default: 'What is the purpose of this email?',
                })}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Tone Selector */}
            <div className="space-y-2">
              <Label htmlFor="ai-tone">
                {t('mail.tone', { default: 'Tone' })}
              </Label>
              <Select
                value={tone}
                onValueChange={(value) =>
                  setTone(
                    value as 'formal' | 'casual' | 'friendly' | 'professional'
                  )
                }
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">
                    {t('mail.tone_professional', { default: 'Professional' })}
                  </SelectItem>
                  <SelectItem value="formal">
                    {t('mail.tone_formal', { default: 'Formal' })}
                  </SelectItem>
                  <SelectItem value="friendly">
                    {t('mail.tone_friendly', { default: 'Friendly' })}
                  </SelectItem>
                  <SelectItem value="casual">
                    {t('mail.tone_casual', { default: 'Casual' })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Generate Button */}
            <Button
              type="button"
              onClick={() => handleGenerateDraft(false)}
              disabled={isLoading || !context.trim()}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <LoadingIndicator className="mr-2" />
                  {t('mail.generating', { default: 'Generating...' })}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('mail.generate_draft', { default: 'Generate Draft' })}
                </>
              )}
            </Button>

            {/* Error Display */}
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                {t('mail.ai_error', {
                  default: 'Failed to generate email draft. Please try again.',
                })}
              </div>
            )}

            {/* Generated Draft Display */}
            {object && (
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <div className="space-y-2">
                  <Label className="font-medium text-sm">
                    {t('mail.generated_subject', {
                      default: 'Generated Subject',
                    })}
                  </Label>
                  <div className="rounded bg-background p-2 text-sm">
                    {object.subject}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-medium text-sm">
                    {t('mail.generated_content', {
                      default: 'Generated Content',
                    })}
                  </Label>
                  <div className="whitespace-pre-wrap rounded bg-background p-2 text-sm">
                    {object.content}
                  </div>
                </div>

                {object.suggestions && object.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-medium text-sm">
                      {t('mail.suggestions', { default: 'Suggestions' })}
                    </Label>
                    <ul className="space-y-1 text-muted-foreground text-xs">
                      {object.suggestions
                        ?.filter((s): s is string => Boolean(s))
                        .map((suggestion, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="mt-1 h-1 w-1 rounded-full bg-primary" />
                            {suggestion}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={handleApplyDraft}
                  className="w-full"
                  size="sm"
                >
                  {t('mail.apply_draft', { default: 'Apply Draft' })}
                </Button>

                {/* Revision Section */}
                <div className="mt-4 space-y-3 border-t pt-4">
                  <Label className="font-medium text-sm">
                    {t('mail.revise_email', { default: 'Revise Email' })}
                  </Label>
                  <Textarea
                    placeholder={t('mail.revision_placeholder', {
                      default: 'Describe how you want to revise the email...',
                    })}
                    value={revisionInstructions}
                    onChange={(e) => setRevisionInstructions(e.target.value)}
                    disabled={isRevising}
                    minRows={2}
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Button
                    type="button"
                    onClick={() => handleGenerateDraft(true)}
                    disabled={isRevising || !revisionInstructions.trim()}
                    className="w-full"
                    size="sm"
                    variant="outline"
                  >
                    {isRevising ? (
                      <>
                        <LoadingIndicator className="mr-2" />
                        {t('mail.revising', { default: 'Revising...' })}
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 h-4 w-4" />
                        {t('mail.revise', { default: 'Revise' })}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
