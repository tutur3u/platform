'use client';

import {
  createChange,
  createReorder,
  createRovingFocus,
  definePrimitive,
  type ReorderDraft,
  type ReorderMessage,
} from '@ui-sdk/core';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { CategoryColorsData } from './category-color-settings';

type Options = {
  value: string[];
  onValueChange: (value: string[]) => void;
  message: (message: ReorderMessage) => string;
};
type State = {
  value: string[];
  focused: string | null;
  moving: ReorderDraft | null;
};

const categoryOrder = definePrimitive({
  name: 'category-order-pilot',
  options: { value: 'list', onValueChange: 'callback', message: 'callback' },
  state: (options: Options): State => ({
    value: options.value,
    focused: null,
    moving: null,
  }),
  sync: (options) => ({ value: options.value }),
  api: (context) => {
    const change = createChange(context);
    const roving = createRovingFocus<State>(context, {
      slot: 'item',
      key: 'focused',
    });
    const reorder = createReorder<State>(context, {
      slot: 'item',
      key: 'value',
      draft: 'moving',
      set: (value, details) => change('value', value, details),
      message: (message) => context.options().message(message),
    });
    return { roving, reorder };
  },
  slots: () => ({}),
});
type Instance = ReturnType<typeof categoryOrder>;
const noopSubscribe = () => () => {};
const emptyState: State = { value: [], focused: null, moving: null };
const getEmptyState = () => emptyState;

/** Opt-in reorder-only companion; existing category editors keep their props and behavior. */
export function CategoryOrderPilot({
  value,
  onChange,
}: {
  value: CategoryColorsData;
  onChange: (value: CategoryColorsData) => void;
}) {
  const t = useTranslations('calendar_category_reorder_pilot');
  const id = useId();
  const [instance, setInstance] = useState<Instance | null>(null);
  const keys = value.categories.map((category) => category.name);
  const valid = new Set(keys).size === keys.length && keys.every(Boolean);
  const options: Options & { id: string } = {
    id,
    value: valid ? keys : [],
    onValueChange: (order) => {
      const categories = order.flatMap((name) =>
        value.categories.filter((category) => category.name === name)
      );
      if (valid && categories.length === value.categories.length)
        onChange({ categories });
    },
    message: ({ type, label, position, total }) =>
      t(type, { label, position, total }),
  };

  useEffect(() => {
    const next = categoryOrder({
      id,
      value: [],
      onValueChange: () => {},
      message: () => '',
    });
    setInstance(next);
    return () => next.destroy();
  }, [id]);
  useEffect(() => {
    instance?.setOptions(options);
  });
  const state = useSyncExternalStore(
    instance?.subscribe ?? noopSubscribe,
    instance?.get ?? getEmptyState,
    getEmptyState
  );
  const order = instance ? instance.api.reorder.order(state) : keys;

  return (
    <div>
      <p id={`${id}-instructions`} className="text-muted-foreground text-sm">
        {t('instructions')}
      </p>
      {!valid ? (
        <p role="alert">{t('invalid')}</p>
      ) : (
        <div
          role="listbox"
          aria-label={t('label')}
          aria-describedby={`${id}-instructions`}
          aria-orientation="vertical"
          className="flex flex-col gap-2"
        >
          {order.map((name, index) => (
            <div
              key={name}
              role="option"
              aria-selected={state.moving?.key === name}
              aria-posinset={index + 1}
              aria-setsize={order.length}
              tabIndex={
                instance
                  ? Number(
                      instance.api.roving.tabIndex(state, {
                        key: name,
                        props: {},
                      })
                    )
                  : index === 0
                    ? 0
                    : -1
              }
              className="rounded-md border border-border bg-card p-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              ref={(el) => {
                if (!el || !instance) return;
                const part = { key: name, props: {} };
                const cleanups = [
                  instance.api.roving.bind(el, part),
                  instance.api.reorder.bind(el, part),
                ];
                return () => cleanups.forEach((cleanup) => cleanup());
              }}
              onKeyDown={(event) => {
                if (!instance) return;
                if (!instance.api.reorder.keydown(event.nativeEvent, name))
                  instance.api.roving.keydown(
                    event.nativeEvent,
                    event.currentTarget
                  );
              }}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
