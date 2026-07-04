import {
  AlertCircle,
  CircleCheck,
  LogIn,
  Shield,
} from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import type { ContactMessages } from '../../data/contact/contact-content';
import type { SubmissionStatus } from '../../data/contact/contact-form';

export function AuthRequiredNotice({
  href,
  messages,
}: {
  href: string;
  messages: ContactMessages;
}) {
  return (
    <div className="mb-6 rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dynamic-orange/10">
          <Shield className="h-5 w-5 text-dynamic-orange" />
        </div>
        <div className="flex-1">
          <h4 className="mb-1 font-semibold text-sm">
            {messages.form.authRequired.title}
          </h4>
          <p className="mb-3 text-foreground/70 text-xs leading-relaxed">
            {messages.form.authRequired.description}
          </p>
          <Button
            asChild
            className="border-dynamic-orange/30 text-dynamic-orange hover:bg-dynamic-orange/10 hover:text-dynamic-orange"
            size="sm"
            variant="outline"
          >
            <a href={href}>
              <LogIn className="mr-1.5 h-4 w-4" />
              {messages.form.authRequired.loginButton}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SubmissionNotice({ status }: { status: SubmissionStatus }) {
  const Icon = status.type === 'success' ? CircleCheck : AlertCircle;
  const className =
    status.type === 'success'
      ? 'mb-6 border-dynamic-green/30 bg-dynamic-green/5 text-dynamic-green'
      : 'mb-6 border-dynamic-red/30 bg-dynamic-red/5 text-dynamic-red';

  return (
    <div className={`rounded-lg border p-4 ${className}`} role="status">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold text-sm">{status.title}</p>
          <p className="mt-1 text-foreground/70 text-xs leading-relaxed">
            {status.description}
          </p>
        </div>
      </div>
    </div>
  );
}
