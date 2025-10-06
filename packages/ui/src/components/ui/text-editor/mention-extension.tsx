import { Node } from '@tiptap/react';
import {
  Box,
  BriefcaseBusiness,
  Calendar,
  CircleCheck,
  User,
} from '@tuturuuu/ui/icons';
import { renderToString } from 'react-dom/server';

interface MentionVisualMeta {
  prefix: string;
  pillClass: string;
  avatarClass: string;
  fallback: string;
  icon?: string;
}

const getMentionVisualMeta = (entityType?: string): MentionVisualMeta => {
  switch (entityType) {
    case 'workspace':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange',
        avatarClass:
          'border-dynamic-orange/30 bg-dynamic-orange/20 text-dynamic-orange',
        fallback: 'W',
        icon: renderToString(<BriefcaseBusiness className="h-3 w-3" />),
      };
    case 'project':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-cyan/40 bg-dynamic-cyan/10 text-dynamic-cyan',
        avatarClass:
          'border-dynamic-cyan/30 bg-dynamic-cyan/20 text-dynamic-cyan',
        fallback: 'P',
        icon: renderToString(<Box className="h-3 w-3" />),
      };
    case 'task':
      return {
        prefix: '#',
        pillClass:
          'leading-relaxed border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue',
        avatarClass:
          'border-dynamic-blue/30 bg-dynamic-blue/20 text-dynamic-blue',
        fallback: '#',
        icon: renderToString(<CircleCheck className="h-3 w-3" />),
      };
    case 'date':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-pink/40 bg-dynamic-pink/10 text-dynamic-pink',
        avatarClass:
          'border-dynamic-pink/30 bg-dynamic-pink/20 text-dynamic-pink',
        fallback: 'D',
        icon: renderToString(<Calendar className="h-3 w-3" />),
      };
    case 'external-user':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-gray/40 bg-dynamic-gray/10 text-dynamic-gray',
        avatarClass:
          'border-dynamic-gray/30 bg-dynamic-gray/20 text-dynamic-gray',
        fallback: '@',
        icon: renderToString(<User className="h-3 w-3" />),
      };
    case 'user':
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green',
        avatarClass:
          'border-dynamic-green/30 bg-dynamic-green/20 text-dynamic-green',
        fallback: '@',
      };
    default:
      return {
        prefix: '@',
        pillClass:
          'leading-relaxed border-border bg-muted text-muted-foreground',
        avatarClass: 'border-border bg-muted text-muted-foreground',
        fallback: '@',
      };
  }
};

const getInitials = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '??';
  return (
    trimmed
      .split(/\s+/)
      .map((part) => part?.[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || '??'
  );
};

export const Mention = Node.create({
  name: 'mention',

  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      userId: {
        default: null,
      },
      entityId: {
        default: null,
      },
      entityType: {
        default: 'user',
      },
      displayName: {
        default: null,
      },
      avatarUrl: {
        default: null,
      },
      subtitle: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention="true"]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          return {
            userId: element.dataset.userId ?? null,
            entityId: element.dataset.entityId ?? null,
            entityType: element.dataset.entityType ?? 'user',
            displayName: element.dataset.displayName ?? null,
            avatarUrl: element.dataset.avatarUrl ?? null,
            subtitle: element.dataset.subtitle ?? null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = { ...HTMLAttributes };
    const userId = (attrs.userId as string | null) ?? null;
    const entityId = (attrs.entityId as string | null) ?? userId;
    const entityType = (attrs.entityType as string | null) ?? 'user';
    const displayNameRaw = (attrs.displayName as string | null) ?? null;
    const avatarUrl = (attrs.avatarUrl as string | null) ?? null;
    const subtitle = (attrs.subtitle as string | null) ?? null;

    delete attrs.userId;
    delete attrs.entityId;
    delete attrs.entityType;
    delete attrs.displayName;
    delete attrs.avatarUrl;
    delete attrs.subtitle;

    const displayName = (displayNameRaw || 'Member').trim();
    const visuals = getMentionVisualMeta(entityType);
    const initials = getInitials(displayName);
    const fallbackGlyph =
      entityType === 'user' || entityType === 'external-user'
        ? initials
        : visuals.fallback;

    const baseAttributes = {
      'data-mention': 'true',
      'data-user-id': userId ?? '',
      'data-entity-id': entityId ?? '',
      'data-entity-type': entityType,
      'data-display-name': displayName,
      'data-avatar-url': avatarUrl ?? '',
      'data-subtitle': subtitle ?? '',
      class: `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium transition-colors ${visuals.pillClass}`,
      ...attrs,
    };

    const avatarNode: any = avatarUrl
      ? [
          'span',
          {
            class: `relative -ml-0.5 h-4 w-4 overflow-hidden rounded-full border ${visuals.avatarClass}`,
          },
          [
            'img',
            {
              src: avatarUrl,
              alt: displayName,
              class: 'h-full w-full object-cover',
            },
          ],
        ]
      : visuals.icon
        ? [
            'span',
            {
              class: `relative -ml-0.5 flex h-4 w-4 items-center justify-center rounded-full border ${visuals.avatarClass}`,
              innerHTML: visuals.icon,
            },
          ]
        : [
            'span',
            {
              class: `relative -ml-0.5 flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold uppercase ${visuals.avatarClass}`,
            },
            fallbackGlyph,
          ];

    return [
      'span',
      baseAttributes,
      avatarNode,
      [
        'span',
        { class: 'text-current font-semibold' },
        `${visuals.prefix}${displayName}`,
      ],
    ] as any;
  },

  addNodeView() {
    return ({ node }) => {
      let currentDisplayName =
        (node.attrs.displayName as string | null)?.trim() || 'Member';
      let currentAvatarUrl = node.attrs.avatarUrl as string | null;
      const userId = (node.attrs.userId as string | null) ?? '';
      let currentEntityId = (node.attrs.entityId as string | null) ?? userId;
      let currentEntityType =
        (node.attrs.entityType as string | null) ?? 'user';
      let currentSubtitle = (node.attrs.subtitle as string | null) ?? null;
      let visuals = getMentionVisualMeta(currentEntityType);

      const dom = document.createElement('span');
      dom.setAttribute('data-mention', 'true');
      dom.setAttribute('data-user-id', userId);
      dom.setAttribute('data-display-name', currentDisplayName);
      dom.setAttribute('data-entity-id', currentEntityId ?? '');
      dom.setAttribute('data-entity-type', currentEntityType);
      if (currentAvatarUrl)
        dom.setAttribute('data-avatar-url', currentAvatarUrl);
      if (currentSubtitle) dom.setAttribute('data-subtitle', currentSubtitle);
      dom.className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium transition-colors ${visuals.pillClass}`;
      dom.contentEditable = 'false';
      dom.title = currentSubtitle
        ? `${visuals.prefix}${currentDisplayName} • ${currentSubtitle}`
        : `${visuals.prefix}${currentDisplayName}`;

      const avatarWrapper = document.createElement('span');
      avatarWrapper.className = `relative -ml-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border text-[10px] font-semibold uppercase ${visuals.avatarClass}`;

      if (currentAvatarUrl) {
        const img = document.createElement('img');
        img.src = currentAvatarUrl;
        img.alt = currentDisplayName;
        img.className = 'h-full w-full object-cover';
        img.referrerPolicy = 'no-referrer';
        avatarWrapper.textContent = '';
        avatarWrapper.appendChild(img);
      } else if (visuals.icon) {
        avatarWrapper.innerHTML = visuals.icon;
      } else {
        avatarWrapper.textContent =
          currentEntityType === 'user' || currentEntityType === 'external-user'
            ? getInitials(currentDisplayName)
            : visuals.fallback;
      }

      const label = document.createElement('span');
      label.className = 'text-current font-semibold';
      label.textContent = `${visuals.prefix}${currentDisplayName}`;

      dom.appendChild(avatarWrapper);
      dom.appendChild(label);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mention') return false;
          const nextDisplayName =
            (updatedNode.attrs.displayName as string | null)?.trim() ||
            'Member';
          const nextAvatarUrl = updatedNode.attrs.avatarUrl as string | null;
          const nextEntityId =
            (updatedNode.attrs.entityId as string | null) ??
            (updatedNode.attrs.userId as string | null) ??
            null;
          const nextEntityType =
            (updatedNode.attrs.entityType as string | null) ?? 'user';
          const nextSubtitle =
            (updatedNode.attrs.subtitle as string | null) ?? null;

          if (nextDisplayName !== currentDisplayName) {
            label.textContent = `${visuals.prefix}${nextDisplayName}`;
            dom.setAttribute('data-display-name', nextDisplayName);
            currentDisplayName = nextDisplayName;
            if (!currentAvatarUrl) {
              if (
                currentEntityType === 'user' ||
                currentEntityType === 'external-user'
              ) {
                avatarWrapper.textContent = getInitials(currentDisplayName);
              } else if (visuals.icon) {
                avatarWrapper.innerHTML = visuals.icon;
              }
            }
          }

          if (nextAvatarUrl !== currentAvatarUrl) {
            if (nextAvatarUrl) {
              const img = document.createElement('img');
              img.src = nextAvatarUrl;
              img.alt = nextDisplayName;
              img.className = 'h-full w-full object-cover';
              img.referrerPolicy = 'no-referrer';
              avatarWrapper.textContent = '';
              avatarWrapper.appendChild(img);
              dom.setAttribute('data-avatar-url', nextAvatarUrl);
            } else {
              const nextVisuals = getMentionVisualMeta(nextEntityType);
              dom.removeAttribute('data-avatar-url');
              if (
                nextEntityType === 'user' ||
                nextEntityType === 'external-user'
              ) {
                avatarWrapper.textContent = getInitials(nextDisplayName);
              } else if (nextVisuals.icon) {
                avatarWrapper.innerHTML = nextVisuals.icon;
              } else {
                avatarWrapper.textContent = nextVisuals.fallback;
              }
            }
            currentAvatarUrl = nextAvatarUrl;
          }

          if (nextEntityType !== currentEntityType) {
            currentEntityType = nextEntityType;
            visuals = getMentionVisualMeta(currentEntityType);
            dom.setAttribute('data-entity-type', currentEntityType);
            dom.className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium transition-colors ${visuals.pillClass}`;
            avatarWrapper.className = `relative -ml-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border text-[10px] font-semibold uppercase ${visuals.avatarClass}`;
            label.textContent = `${visuals.prefix}${currentDisplayName}`;
            if (!currentAvatarUrl) {
              if (
                currentEntityType === 'user' ||
                currentEntityType === 'external-user'
              ) {
                avatarWrapper.textContent = getInitials(currentDisplayName);
              } else if (visuals.icon) {
                avatarWrapper.innerHTML = visuals.icon;
              } else {
                avatarWrapper.textContent = visuals.fallback;
              }
            }
            dom.title = currentSubtitle
              ? `${visuals.prefix}${currentDisplayName} • ${currentSubtitle}`
              : `${visuals.prefix}${currentDisplayName}`;
          }

          if (nextEntityId !== currentEntityId && nextEntityId !== null) {
            currentEntityId = nextEntityId;
            dom.setAttribute('data-entity-id', currentEntityId ?? '');
          }

          if (nextSubtitle !== currentSubtitle) {
            currentSubtitle = nextSubtitle;
            if (currentSubtitle) {
              dom.setAttribute('data-subtitle', currentSubtitle);
            } else {
              dom.removeAttribute('data-subtitle');
            }
            dom.title = currentSubtitle
              ? `${visuals.prefix}${currentDisplayName} • ${currentSubtitle}`
              : `${visuals.prefix}${currentDisplayName}`;
          }

          dom.title = currentSubtitle
            ? `${visuals.prefix}${currentDisplayName} • ${currentSubtitle}`
            : `${visuals.prefix}${currentDisplayName}`;

          return true;
        },
        ignoreMutation() {
          return true;
        },
      };
    };
  },
});
