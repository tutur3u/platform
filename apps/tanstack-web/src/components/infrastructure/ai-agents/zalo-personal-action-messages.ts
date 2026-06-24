import type { AiAgentZaloPersonalAction } from '@tuturuuu/internal-api/infrastructure/ai';
import type { useTranslations } from 'use-intl';

type Translator = ReturnType<typeof useTranslations>;

export function actionSuccessMessage(
  t: Translator,
  action: AiAgentZaloPersonalAction
) {
  switch (action) {
    case 'start':
      return t('messages.zalo_personal_start_success');
    case 'stop':
      return t('messages.zalo_personal_stop_success');
    case 'validate':
      return t('messages.zalo_personal_validate_success');
    case 'sync-history':
    case 'sync-phone':
      return t('messages.zalo_personal_validate_success');
  }
}

export function actionErrorMessage(
  t: Translator,
  action: AiAgentZaloPersonalAction
) {
  switch (action) {
    case 'start':
      return t('messages.zalo_personal_start_error');
    case 'stop':
      return t('messages.zalo_personal_stop_error');
    case 'validate':
      return t('messages.zalo_personal_validate_error');
    case 'sync-history':
    case 'sync-phone':
      return t('messages.zalo_personal_validate_error');
  }
}
