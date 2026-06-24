import { render } from '@react-email/render';
import DeadlineReminderEmail from '@tuturuuu/transactional/emails/deadline-reminder';
import GuestTemplate from '@tuturuuu/transactional/emails/guest-template';
import NotificationDigestEmail from '@tuturuuu/transactional/emails/notification-digest';
import PostEmailTemplate from '@tuturuuu/transactional/emails/post-template';
import WorkspaceInviteEmail from '@tuturuuu/transactional/emails/workspace-invite';
import { type ComponentType, createElement } from 'react';
import { type EmailTemplateId, getTemplateById } from './template-definitions';

export type RenderEmailTemplateRequest = {
  props: Record<string, unknown>;
  templateId: string;
};

export type RenderEmailTemplateResponse = {
  html: string;
};

const templateComponents: Record<
  EmailTemplateId,
  ComponentType<Record<string, unknown>>
> = {
  'deadline-reminder': DeadlineReminderEmail as ComponentType<
    Record<string, unknown>
  >,
  'guest-template': GuestTemplate as ComponentType<Record<string, unknown>>,
  'notification-digest': NotificationDigestEmail as ComponentType<
    Record<string, unknown>
  >,
  'post-template': PostEmailTemplate as ComponentType<Record<string, unknown>>,
  'workspace-invite': WorkspaceInviteEmail as ComponentType<
    Record<string, unknown>
  >,
};

export async function renderEmailTemplatePreview({
  props,
  templateId,
}: RenderEmailTemplateRequest): Promise<RenderEmailTemplateResponse> {
  const template = getTemplateById(templateId);

  if (!template) {
    throw new Error(`Unknown email template: ${templateId}`);
  }

  const Component = templateComponents[template.id];
  const html = await render(
    createElement(Component, { ...template.defaultProps, ...props })
  );

  return { html };
}
