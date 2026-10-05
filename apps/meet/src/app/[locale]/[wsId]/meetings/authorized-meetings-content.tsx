import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { canVerifiedAccountHostMeeting } from '@tuturuuu/utils/meet-hosting';
import { getTranslations } from 'next-intl/server';
import { MeetingsContent } from './meetings-content';

/** Hosting eligibility gates controls, not the already-authorized workspace heading. */
export async function AuthorizedMeetingsContent(props: {
  accountId: string;
  wsId: string;
  page: number;
  pageSize: number;
  search: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { data: identity, error: identityError } =
    await admin.auth.admin.getUserById(props.accountId);
  let unavailable = Boolean(identityError);
  const canCreate =
    !identityError &&
    (await canVerifiedAccountHostMeeting(props.accountId, identity.user).catch(
      () => {
        unavailable = true;
        return false;
      }
    ));
  const t = await getTranslations('meet.call');
  return (
    <>
      {!canCreate && (
        <p
          className="mb-6 rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm"
          role={unavailable ? 'alert' : undefined}
        >
          {t(unavailable ? 'hosting_unavailable' : 'creation_restricted')}
        </p>
      )}
      <MeetingsContent {...props} canCreate={canCreate} />
    </>
  );
}
