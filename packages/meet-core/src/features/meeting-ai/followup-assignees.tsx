'use client';
import type { MeetFollowupContext } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { MeetingFollowup } from './followup-types';

type Member = NonNullable<MeetFollowupContext['members']>[number];
export function matchFollowupOwner(
  suggestion: Pick<MeetingFollowup, 'ownerId' | 'owner'>,
  members: Member[]
) {
  if (suggestion.ownerId)
    return members.find((member) => member.id === suggestion.ownerId) ?? null;
  const owner = suggestion.owner?.trim().toLocaleLowerCase();
  if (!owner) return null;
  const matched = members.filter((member) =>
    [member.displayName, member.email].some(
      (value) => value?.trim().toLocaleLowerCase() === owner
    )
  );
  return matched.length === 1 ? matched[0]! : null;
}
export function FollowupAssignees({
  members,
  selected,
  onChange,
  suggestion,
  userId,
}: {
  members: Member[];
  selected: string[];
  onChange: (ids: string[]) => void;
  suggestion: MeetingFollowup;
  userId: string;
}) {
  const t = useTranslations('meet.ai');
  const [search, setSearch] = useState('');
  const owner = matchFollowupOwner(suggestion, members);
  const visible = members.filter((member) =>
    [member.displayName, member.email, member.id].some((value) =>
      value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    )
  );
  return (
    <section
      className="space-y-2 rounded-lg border p-3"
      aria-label={t('followup_assignees')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-sm">
          {t('followup_assignees')}{' '}
          <span className="text-muted-foreground">({selected.length})</span>
        </h3>
        {members.some((member) => member.id === userId) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange([...new Set([...selected, userId])])}
          >
            {t('followup_assign_me')}
          </Button>
        )}
      </div>
      {owner ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-auto max-w-full whitespace-normal"
          onClick={() => onChange([...new Set([...selected, owner.id])])}
        >
          {t('followup_use_owner', {
            name: owner.displayName || owner.email || owner.id,
          })}
        </Button>
      ) : (
        suggestion.owner && (
          <p className="text-muted-foreground text-xs">
            {t('followup_owner_unmatched', { name: suggestion.owner })}
          </p>
        )
      )}
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('followup_search_people')}
        aria-label={t('followup_search_people')}
      />
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {visible.map((member) => (
          <label
            key={member.id}
            className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
          >
            <Checkbox
              checked={selected.includes(member.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [...new Set([...selected, member.id])]
                    : selected.filter((id) => id !== member.id)
                )
              }
            />
            <span className="min-w-0 text-sm">
              <span className="block break-words">
                {member.displayName || member.email || member.id}
              </span>
              {member.displayName && member.email && (
                <span className="block break-words text-muted-foreground text-xs">
                  {member.email}
                </span>
              )}
            </span>
          </label>
        ))}
        {!visible.length && (
          <p className="p-2 text-muted-foreground text-sm">
            {t('followup_no_matches')}
          </p>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        {t('followup_assignee_hint')}
      </p>
    </section>
  );
}
