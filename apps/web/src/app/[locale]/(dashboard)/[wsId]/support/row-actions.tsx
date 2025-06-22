'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from '@tuturuuu/types/supabase';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { 
  MoreHorizontal,
  Eye,
  Copy,
  Calendar,
} from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import moment from 'moment';

type SupportInquiry = Database['public']['Tables']['support_inquiries']['Row'];

interface RowActionsProps {
  inquiry: SupportInquiry;
  extraData?: {
    locale?: string;
    wsId?: string;
  };
}

export function RowActions({ inquiry, extraData }: RowActionsProps) {
  const [isLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations();

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(inquiry.id);
      toast({
        title: t('support.copied'),
        description: t('support.inquiry_id_copied'),
      });
    } catch {
      toast({
        title: t('support.error'),
        description: t('support.copy_failed'),
        variant: 'destructive',
      });
    }
  };

  const handleCopyDetails = async () => {
    try {
      const details = `
Support Inquiry Details:
ID: ${inquiry.id}
Subject: ${inquiry.subject}
Status: ${inquiry.is_resolved ? 'Resolved' : 'Open'}
Created: ${moment(inquiry.created_at).format('YYYY-MM-DD HH:mm:ss')}
Message: ${inquiry.message}
      `.trim();
      
      await navigator.clipboard.writeText(details);
      toast({
        title: t('support.copied'),
        description: t('support.details_copied'),
      });
    } catch {
      toast({
        title: t('support.error'),
        description: t('support.copy_failed'),
        variant: 'destructive',
      });
    }
  };

  const handleViewDetails = () => {
    if (extraData?.wsId) {
      router.push(`/${extraData.wsId}/support/${inquiry.id}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0"
          disabled={isLoading}
        >
          <span className="sr-only">Open options</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleViewDetails}>
          <Eye className="mr-2 h-4 w-4" />
          {t('support.view_details')}
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={handleCopyId}>
          <Copy className="mr-2 h-4 w-4" />
          {t('support.copy_id')}
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={handleCopyDetails}>
          <Copy className="mr-2 h-4 w-4" />
          {t('support.copy_details')}
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem disabled className="opacity-50">
          <Calendar className="mr-2 h-4 w-4" />
          {t('support.created')} {moment(inquiry.created_at).fromNow()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 