'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import { getAvatarPlaceholder, getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';

interface InvoiceCustomerSelectCardProps {
  title: string;
  description: string;
  customers: WorkspaceUser[];
  selectedUserId: string;
  onSelect: (value: string) => void;
  selectedUser?: WorkspaceUser;
  showUserPreview?: boolean;
  loading?: boolean;
  loadingMessage?: string;
  errorMessage?: string;
  emptyMessage?: string;
  children?: React.ReactNode;
}

export function InvoiceCustomerSelectCard({
  title,
  description,
  customers,
  selectedUserId,
  onSelect,
  selectedUser,
  showUserPreview = false,
  loading,
  loadingMessage,
  errorMessage,
  emptyMessage,
  children,
}: InvoiceCustomerSelectCardProps) {
  const t = useTranslations();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {errorMessage && (
          <div className="text-destructive text-sm">{errorMessage}</div>
        )}
        {loading && loadingMessage && (
          <div className="text-muted-foreground text-sm">{loadingMessage}</div>
        )}
        {!loading &&
          !errorMessage &&
          customers.length === 0 &&
          emptyMessage && (
            <div className="text-muted-foreground text-sm">{emptyMessage}</div>
          )}
        <div className="space-y-2">
          <Label htmlFor="customer-select">{t('ws-invoices.customer')}</Label>
          <Combobox
            t={t}
            options={customers.map(
              (user): ComboboxOption => ({
                value: user.id,
                label: `${user.full_name} ${user.display_name ? `(${user.display_name})` : ''} (${user.email || user.phone || '-'})`,
              })
            )}
            selected={selectedUserId}
            onChange={(value) => onSelect(value as string)}
            placeholder={t('ws-invoices.search_customers')}
          />
        </div>

        {showUserPreview && selectedUser && (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage
                src={
                  selectedUser.avatar_url ||
                  getAvatarPlaceholder(
                    selectedUser.full_name ||
                      selectedUser.display_name ||
                      'Unknown'
                  )
                }
                alt={
                  selectedUser.full_name ||
                  selectedUser.display_name ||
                  'Unknown'
                }
              />
              <AvatarFallback>
                {getInitials(
                  selectedUser.full_name ||
                    selectedUser.display_name ||
                    'Unknown'
                )}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {selectedUser.full_name || selectedUser.display_name}
              </p>
              <p className="truncate text-muted-foreground text-sm">
                {selectedUser.email || selectedUser.phone || '-'}
              </p>
            </div>
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
