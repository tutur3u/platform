'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Database } from '@tuturuuu/types/supabase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
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
  Calendar,
  CheckCircle,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Mail,
  MoreHorizontal,
  Trash2,
  UserCircle,
} from '@tuturuuu/ui/icons';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type SupportInquiry = Database['public']['Tables']['support_inquiries']['Row'];

interface AdminRowActionsProps {
  inquiry: SupportInquiry;
  extraData?: {
    locale?: string;
    wsId?: string;
  };
}

export function AdminRowActions({ inquiry, extraData }: AdminRowActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const router = useRouter();
  const t = useTranslations();
  const supabase = createClient();

  const handleMarkAsRead = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('support_inquiries')
        .update({ is_read: !inquiry.is_read })
        .eq('id', inquiry.id);

      if (error) {
        console.error('Error updating inquiry:', error);
        toast({
          title: t('support.error'),
          description: t('support.update_failed'),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('support.success'),
        description: inquiry.is_read
          ? t('support.marked_unread')
          : t('support.marked_read'),
      });

      router.refresh();
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: t('support.error'),
        description: t('support.update_failed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsResolved = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('support_inquiries')
        .update({
          is_resolved: !inquiry.is_resolved,
          is_read: true, // Auto-mark as read when resolving
        })
        .eq('id', inquiry.id);

      if (error) {
        console.error('Error updating inquiry:', error);
        toast({
          title: t('support.error'),
          description: t('support.update_failed'),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('support.success'),
        description: inquiry.is_resolved
          ? t('support.marked_unresolved')
          : t('support.marked_resolved'),
      });

      router.refresh();
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: t('support.error'),
        description: t('support.update_failed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('support_inquiries')
        .delete()
        .eq('id', inquiry.id);

      if (error) {
        console.error('Error deleting inquiry:', error);
        toast({
          title: t('support.error'),
          description: t('support.delete_failed'),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('support.success'),
        description: t('support.inquiry_deleted'),
      });

      router.refresh();
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: t('support.error'),
        description: t('support.delete_failed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(inquiry.email);
      toast({
        title: t('support.copied'),
        description: t('support.email_copied'),
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
Name: ${inquiry.name}
Email: ${inquiry.email}
Subject: ${inquiry.subject}
Status: ${inquiry.is_resolved ? 'Resolved' : 'Open'}
Read: ${inquiry.is_read ? 'Yes' : 'No'}
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

  const handleEmailReply = () => {
    const subject = `Re: ${inquiry.subject}`;
    const body = `\n\n--- Original Message ---\nFrom: ${inquiry.name} <${inquiry.email}>\nDate: ${moment(inquiry.created_at).format('YYYY-MM-DD HH:mm:ss')}\nSubject: ${inquiry.subject}\n\n${inquiry.message}`;
    const mailtoUrl = `mailto:${inquiry.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" disabled={isLoading}>
            <span className="sr-only">Open options</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleViewDetails}>
            <Eye className="mr-2 h-4 w-4" />
            {t('support.view_details')}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleEmailReply}>
            <Mail className="mr-2 h-4 w-4" />
            {t('support.reply_via_email')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleMarkAsRead}>
            {inquiry.is_read ? (
              <EyeOff className="mr-2 h-4 w-4" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            {inquiry.is_read
              ? t('support.mark_unread')
              : t('support.mark_read')}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleMarkAsResolved}>
            {inquiry.is_resolved ? (
              <Circle className="mr-2 h-4 w-4" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            {inquiry.is_resolved
              ? t('support.mark_unresolved')
              : t('support.mark_resolved')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleCopyEmail}>
            <Copy className="mr-2 h-4 w-4" />
            {t('support.copy_email')}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleCopyDetails}>
            <Copy className="mr-2 h-4 w-4" />
            {t('support.copy_details')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem disabled className="opacity-50">
            <UserCircle className="mr-2 h-4 w-4" />
            {inquiry.name || t('support.anonymous')}
          </DropdownMenuItem>

          <DropdownMenuItem disabled className="opacity-50">
            <Calendar className="mr-2 h-4 w-4" />
            {moment(inquiry.created_at).fromNow()}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('support.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('support.delete_inquiry')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('support.delete_confirmation')}
              <br />
              <br />
              <span className="font-semibold">Subject:</span> {inquiry.subject}
              <br />
              <span className="font-semibold">From:</span> {inquiry.name} (
              {inquiry.email})
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('support.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
