import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Archive,
  Forward,
  Loader2,
  MoreVertical,
  Reply,
  ReplyAll,
  Trash2,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import type { Mail } from '../client';

interface MailDisplayProps {
  mail: Mail | null;
}

const DISABLE_MAIL_ACTIONS = true;

export function MailDisplay({ mail }: MailDisplayProps) {
  const [sanitizedHtml, setSanitizedHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const sanitizeContent = async () => {
      if (!mail?.text) {
        setSanitizedHtml('');
        setIsLoading(false);
        return;
      }

      try {
        // Dynamically import DOMPurify only on client-side
        const DOMPurify = (await import('dompurify')).default;
        const sanitized = DOMPurify.sanitize(mail.text);
        setSanitizedHtml(sanitized);
      } catch (error) {
        console.error('Failed to sanitize HTML:', error);
        // Fallback to plain text if DOMPurify fails
        setSanitizedHtml(mail.text.replace(/<[^>]*>/g, ''));
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    sanitizeContent();
  }, [mail?.text]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center px-2 h-16">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
              >
                <Archive className="h-4 w-4" />
                <span className="sr-only">Archive</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archive</TooltipContent>
          </Tooltip>
          {/*<Tooltip>*/}
          {/*  <TooltipTrigger asChild>*/}
          {/*    <Button variant="ghost" size="icon" disabled={!mail}>*/}
          {/*      <ArchiveX className="h-4 w-4" />*/}
          {/*      <span className="sr-only">Move to junk</span>*/}
          {/*    </Button>*/}
          {/*  </TooltipTrigger>*/}
          {/*  <TooltipContent>Move to junk</TooltipContent>*/}
          {/*</Tooltip>*/}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Move to trash</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move to trash</TooltipContent>
          </Tooltip>
          {/*<Separator orientation="vertical" className="mx-1 h-6" />*/}
          {/*<Tooltip>*/}
          {/*  <Popover>*/}
          {/*    <PopoverTrigger asChild>*/}
          {/*      <TooltipTrigger asChild>*/}
          {/*        <Button variant="ghost" size="icon" disabled={!mail}>*/}
          {/*          <Clock className="h-4 w-4" />*/}
          {/*          <span className="sr-only">Snooze</span>*/}
          {/*        </Button>*/}
          {/*      </TooltipTrigger>*/}
          {/*    </PopoverTrigger>*/}
          {/*    <PopoverContent className="flex w-[535px] p-0">*/}
          {/*      <div className="flex flex-col gap-2 border-r px-2 py-4">*/}
          {/*        <div className="px-4 text-sm font-medium">Snooze until</div>*/}
          {/*        <div className="grid min-w-[250px] gap-1">*/}
          {/*          <Button*/}
          {/*            variant="ghost"*/}
          {/*            className="justify-start font-normal"*/}
          {/*          >*/}
          {/*            Later today{' '}*/}
          {/*            <span className="text-muted-foreground ml-auto">*/}
          {/*              {format(addHours(today, 4), 'E, h:m b')}*/}
          {/*            </span>*/}
          {/*          </Button>*/}
          {/*          <Button*/}
          {/*            variant="ghost"*/}
          {/*            className="justify-start font-normal"*/}
          {/*          >*/}
          {/*            Tomorrow*/}
          {/*            <span className="text-muted-foreground ml-auto">*/}
          {/*              {format(addDays(today, 1), 'E, h:m b')}*/}
          {/*            </span>*/}
          {/*          </Button>*/}
          {/*          <Button*/}
          {/*            variant="ghost"*/}
          {/*            className="justify-start font-normal"*/}
          {/*          >*/}
          {/*            This weekend*/}
          {/*            <span className="text-muted-foreground ml-auto">*/}
          {/*              {format(nextSaturday(today), 'E, h:m b')}*/}
          {/*            </span>*/}
          {/*          </Button>*/}
          {/*          <Button*/}
          {/*            variant="ghost"*/}
          {/*            className="justify-start font-normal"*/}
          {/*          >*/}
          {/*            Next week*/}
          {/*            <span className="text-muted-foreground ml-auto">*/}
          {/*              {format(addDays(today, 7), 'E, h:m b')}*/}
          {/*            </span>*/}
          {/*          </Button>*/}
          {/*        </div>*/}
          {/*      </div>*/}
          {/*      <div className="p-2">*/}
          {/*        <Calendar />*/}
          {/*      </div>*/}
          {/*    </PopoverContent>*/}
          {/*  </Popover>*/}
          {/*  <TooltipContent>Snooze</TooltipContent>*/}
          {/*</Tooltip>*/}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
              >
                <Reply className="h-4 w-4" />
                <span className="sr-only">Reply</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
              >
                <ReplyAll className="h-4 w-4" />
                <span className="sr-only">Reply all</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply all</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
              >
                <Forward className="h-4 w-4" />
                <span className="sr-only">Forward</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward</TooltipContent>
          </Tooltip>
        </div>
        <Separator orientation="vertical" className="mx-2 h-6" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!mail || DISABLE_MAIL_ACTIONS}
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Mark as unread</DropdownMenuItem>
            {/*<DropdownMenuItem>Star thread</DropdownMenuItem>*/}
            {/*<DropdownMenuItem>Add label</DropdownMenuItem>*/}
            {/*<DropdownMenuItem>Mute thread</DropdownMenuItem>*/}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator />
      {mail ? (
        <div className="flex flex-1 flex-col min-h-0">
          <div className="flex items-start p-6 bg-muted/30">
            <div className="flex items-start gap-4 text-sm flex-1 min-w-0">
              <Avatar className="h-10 w-10">
                <AvatarImage alt={mail.name} />
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {mail.name
                    .split(' ')
                    .map((chunk: string) => chunk[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <div className="grid gap-1.5 min-w-0 flex-1">
                <div className="font-semibold text-base text-foreground">
                  {mail.name}
                </div>
                <div className="text-sm font-medium line-clamp-1 text-foreground/90 break-words">
                  {mail.subject}
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">From:</span> {mail.email}
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">To:</span> {mail.recipient}
                </div>
              </div>
            </div>
            {mail.date && (
              <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                {format(new Date(mail.date), 'PPpp')}
              </div>
            )}
          </div>
          <Separator />
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6 text-sm text-black break-words leading-relaxed [&>*]:text-black [&_p]:text-black [&_div]:text-black [&_span]:text-black [&_h1]:text-black [&_h2]:text-black [&_h3]:text-black [&_h4]:text-black [&_h5]:text-black [&_h6]:text-black [&_a]:text-primary [&_a:hover]:text-primary/80 [&_strong]:font-semibold [&_strong]:text-black [&_em]:italic [&_em]:text-black [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4 [&_li]:text-black [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_code]:bg-muted [&_code]:text-muted-foreground [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-muted [&_pre]:text-muted-foreground [&_pre]:p-3 [&_pre]:rounded [&_table]:border-collapse [&_td]:border [&_th]:border [&_td]:p-2 [&_th]:p-2 [&_td]:text-black [&_th]:text-black">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-muted-foreground">
                    Loading email content...
                  </span>
                </div>
              ) : (
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML output from DOMPurify
                <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
              )}
            </div>
          </ScrollArea>
          {/* <Separator className="mt-auto" />
          <div className="p-6 border-t bg-muted/20">
            <form>
              <div className="grid gap-4">
                <Textarea
                  className="p-4 min-h-[120px] resize-none"
                  placeholder={`Reply to ${mail.name}...`}
                  disabled
                />
                <div className="flex items-center">
                  <Label
                    htmlFor="mute"
                    className="flex items-center gap-2 text-xs font-normal text-muted-foreground"
                  >
                    <Switch id="mute" aria-label="Mute thread" disabled /> Mute
                    this thread
                  </Label>
                  <Button
                    onClick={(e) => e.preventDefault()}
                    size="sm"
                    className="ml-auto px-6"
                    disabled
                  >
                    Send
                  </Button>
                </div>
              </div>
            </form>
          </div> */}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-center">
          <div className="max-w-md mx-auto p-8">
            <div className="text-6xl mb-4 opacity-20">📧</div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No email selected
            </h3>
            <p className="text-sm text-muted-foreground">
              Choose an email from the list to view its content here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
