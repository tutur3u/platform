'use client';

import { useTranslations } from 'next-intl';
import type {
  HiveBlock,
  HiveNpc,
  HiveObject,
  HiveVector3,
} from '../../../engine/types';
import { InspectorNumberField } from './inspector-field-controls';

type InspectorTransformFieldsProps =
  | {
      entity: HiveBlock;
      kind: 'block';
      onPatch: (
        id: string,
        patch: Partial<Pick<HiveBlock, 'position'>>
      ) => void;
    }
  | {
      entity: HiveObject;
      kind: 'object';
      onPatch: (
        id: string,
        patch: Partial<Pick<HiveObject, 'position' | 'rotation'>>
      ) => void;
    }
  | {
      entity: HiveNpc;
      kind: 'npc';
      onPatch: (id: string, patch: Partial<HiveNpc>) => void;
    };

export function InspectorTransformFields(props: InspectorTransformFieldsProps) {
  const t = useTranslations('studio.inspector');
  const rotation =
    props.kind === 'object'
      ? (props.entity.rotation ?? 0)
      : props.kind === 'npc' &&
          typeof props.entity.settings.rotation === 'number'
        ? props.entity.settings.rotation
        : 0;

  const commitPosition = (axis: keyof HiveVector3, value: number) => {
    const position = { ...props.entity.position, [axis]: value };

    if (props.kind === 'block') {
      props.onPatch(props.entity.id, { position });
      return;
    }

    if (props.kind === 'object') {
      props.onPatch(props.entity.id, { position });
      return;
    }

    props.onPatch(props.entity.id, { position });
  };

  const commitRotation = (value: number) => {
    if (props.kind === 'object') {
      props.onPatch(props.entity.id, { rotation: value });
      return;
    }

    if (props.kind === 'npc') {
      props.onPatch(props.entity.id, {
        settings: { ...props.entity.settings, rotation: value },
      });
    }
  };

  return (
    <section className="rounded-lg border border-border/20 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-medium text-sm text-zinc-100">{t('transform')}</h3>
        <span className="text-[11px] text-zinc-500">{t('grid_locked')}</span>
      </div>
      <div className="space-y-3">
        <InspectorVectorRow
          label={t('position')}
          onCommit={(axis, value) => commitPosition(axis, value)}
          values={props.entity.position}
        />
        <div>
          <p className="mb-2 font-medium text-[10px] text-zinc-500 uppercase tracking-wide">
            {t('rotation')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <InspectorNumberField
              disabled
              label="X"
              onCommit={() => undefined}
              value={0}
            />
            <InspectorNumberField
              label="Y"
              onCommit={commitRotation}
              value={rotation}
            />
            <InspectorNumberField
              disabled
              label="Z"
              onCommit={() => undefined}
              value={0}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function InspectorVectorRow({
  label,
  onCommit,
  values,
}: {
  label: string;
  onCommit: (axis: keyof HiveVector3, value: number) => void;
  values: HiveVector3;
}) {
  return (
    <div>
      <p className="mb-2 font-medium text-[10px] text-zinc-500 uppercase tracking-wide">
        {label}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <InspectorNumberField
          label="X"
          onCommit={(value) => onCommit('x', value)}
          value={values.x}
        />
        <InspectorNumberField
          label="Y"
          onCommit={(value) => onCommit('y', value)}
          value={values.y}
        />
        <InspectorNumberField
          label="Z"
          onCommit={(value) => onCommit('z', value)}
          value={values.z}
        />
      </div>
    </div>
  );
}
