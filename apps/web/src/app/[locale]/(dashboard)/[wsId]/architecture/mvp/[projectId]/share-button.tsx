'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Copy, Mail, Share2 } from 'lucide-react';

interface ShareButtonProps {
  projectUrl: string;
  projectName: string;
}

export function ShareButton({ projectUrl, projectName }: ShareButtonProps) {
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(projectUrl);
      toast({
        title: 'Link copied',
        description: 'The project link has been copied to your clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy the link to your clipboard.',
        variant: 'destructive',
      });
    }
  };

  const shareByEmail = () => {
    const subject = encodeURIComponent(`Building Project: ${projectName}`);
    const body = encodeURIComponent(
      `Check out this building project analysis: ${projectUrl}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Share2 className="h-4 w-4" />
          <span className="sr-only">Share Project</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={copyToClipboard}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareByEmail}>
          <Mail className="mr-2 h-4 w-4" />
          Share via Email
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
