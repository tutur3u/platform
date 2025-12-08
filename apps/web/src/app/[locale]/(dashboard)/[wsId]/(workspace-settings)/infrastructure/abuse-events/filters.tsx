'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

export default function Filters() {
  const t = useTranslations('abuse-events');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentType = searchParams.get('type') || '';
  const currentSuccess = searchParams.get('success') || '';

  const handleTypeChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      params.set('type', value);
    } else {
      params.delete('type');
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSuccessChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      params.set('success', value);
    } else {
      params.delete('success');
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={currentType || 'all'} onValueChange={handleTypeChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={t('filter_by_type')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('type_all')}</SelectItem>
          <SelectItem value="otp_send">{t('type_otp_send')}</SelectItem>
          <SelectItem value="otp_verify_failed">
            {t('type_otp_verify_failed')}
          </SelectItem>
          <SelectItem value="mfa_challenge">
            {t('type_mfa_challenge')}
          </SelectItem>
          <SelectItem value="mfa_verify_failed">
            {t('type_mfa_verify_failed')}
          </SelectItem>
          <SelectItem value="reauth_send">{t('type_reauth_send')}</SelectItem>
          <SelectItem value="reauth_verify_failed">
            {t('type_reauth_verify_failed')}
          </SelectItem>
          <SelectItem value="password_login_failed">
            {t('type_password_login_failed')}
          </SelectItem>
          <SelectItem value="manual">{t('type_manual')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={currentSuccess || 'all'}
        onValueChange={handleSuccessChange}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t('filter_by_result')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('result_all')}</SelectItem>
          <SelectItem value="true">{t('result_success')}</SelectItem>
          <SelectItem value="false">{t('result_failed')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
