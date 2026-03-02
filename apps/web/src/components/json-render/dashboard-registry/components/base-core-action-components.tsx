'use client';

import { useActions, useStateBinding, useStateStore } from '@json-render/react';
import type {
  JsonRenderButtonProps,
  JsonRenderComponentContext,
  JsonRenderListItemProps,
  JsonRenderTabsProps,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useId } from 'react';
import { dispatchUiAction } from '../../action-dispatch';
import {
  isStructuredSubmitAction,
  resolveActionHandlerMap,
} from '../../action-routing';
import { resolveRegistryIcon } from './base-core-icon';

export const dashboardBaseActionComponents = {
  ListItem: ({
    props,
  }: JsonRenderComponentContext<JsonRenderListItemProps>) => {
    const actions = useActions();
    const IconComp = resolveRegistryIcon(props.icon);
    return (
      <button
        type="button"
        className={cn(
          'flex w-full min-w-0 items-start gap-3 rounded-lg px-1 py-1.5 text-left transition-colors',
          props.action && 'cursor-pointer hover:bg-muted/10 active:bg-muted/20'
        )}
        onClick={() => {
          if (!props.action) return;
          dispatchUiAction(actions, props.action, {
            id: props.action,
            label: props.title,
            source: 'list-item',
          });
        }}
        aria-label={props.title}
      >
        {IconComp && (
          <span
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/10 p-2 text-primary"
            style={
              props.iconColor
                ? {
                    backgroundColor: `${props.iconColor}1a`,
                    color: props.iconColor,
                  }
                : {}
            }
          >
            <IconComp size={16} strokeWidth={1.75} />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="whitespace-normal break-words font-medium text-[14px] leading-tight">
            {props.title}
          </span>
          {props.subtitle && (
            <span className="whitespace-normal break-words text-[12px] text-muted-foreground leading-tight">
              {props.subtitle}
            </span>
          )}
        </div>
        {props.trailing && (
          <span className="max-w-[45%] whitespace-normal break-words font-medium text-[13px] text-muted-foreground leading-tight">
            {props.trailing}
          </span>
        )}
      </button>
    );
  },
  Tabs: ({
    props,
    children,
  }: JsonRenderComponentContext<
    JsonRenderTabsProps,
    Record<string, string>,
    ReactNode | ((ctx: { tabId: string; activeTab: boolean }) => ReactNode)
  >) => {
    const instanceId = useId();
    const tabStateKey = `activeTab-${instanceId.replace(/:/g, '_')}`;
    const [activeTab, setActiveTab] = useStateBinding<string>(tabStateKey);
    const currentTab =
      activeTab ?? props.defaultTab ?? props.tabs?.[0]?.id ?? '';

    return (
      <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
        <TabsList
          className="mb-4 grid w-full"
          style={{
            gridTemplateColumns: `repeat(${props.tabs?.length || 1}, 1fr)`,
          }}
        >
          {props.tabs?.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="text-xs">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {props.tabs?.map((tab) => {
          const tabAwareChildren =
            typeof children === 'function'
              ? (
                  children as (context: {
                    tabId: string;
                    activeTab: boolean;
                  }) => ReactNode
                )({
                  tabId: tab.id,
                  activeTab: tab.id === currentTab,
                })
              : tab.id === currentTab
                ? children
                : null;

          const tabContent =
            typeof tab.content === 'string' ? tab.content : tabAwareChildren;

          return (
            <TabsContent key={tab.id} value={tab.id}>
              {tabContent}
            </TabsContent>
          );
        })}
      </Tabs>
    );
  },
  Button: ({ props }: JsonRenderComponentContext<JsonRenderButtonProps>) => {
    const actions = useActions();
    const { state } = useStateStore();
    const IconComp = props.icon ? resolveRegistryIcon(props.icon) : null;
    return (
      <Button
        type="button"
        variant={props.variant || 'default'}
        size={props.size || 'default'}
        className="h-auto w-full whitespace-normal break-words"
        onClick={() => {
          if (!props.action) return;

          const handlerMap = resolveActionHandlerMap(actions);
          const directHandler = handlerMap[props.action];
          if (typeof directHandler === 'function') {
            void Promise.resolve(directHandler());
            return;
          }

          if (isStructuredSubmitAction(props.action)) {
            const submitFormHandler = handlerMap.submit_form;
            if (typeof submitFormHandler === 'function') {
              void Promise.resolve(
                submitFormHandler({
                  title: props.label || 'Form Submission',
                  values: state,
                  actionId: props.action,
                })
              );
              return;
            }
          }

          dispatchUiAction(actions, props.action, {
            id: props.action,
            label: props.label,
            source: 'button',
          });
        }}
      >
        {IconComp && (
          <IconComp
            className={cn('inline-block', props.label ? 'mr-2' : '')}
            size={16}
          />
        )}
        {props.label}
      </Button>
    );
  },
} as const;
