'use client';

import { createContext, useContext } from 'react';
import type { SizeClass } from './layout-geometry';

/** What an activity can learn about the pane it renders in. */
export interface ActivityPaneValue {
  activityId: string;
  title: string;
  /** On screen now. Heavy editors pause their own work while this is false. */
  active: boolean;
  /** The pane and tab are showing, even when the pane is too small to use. */
  visible: boolean;
  /** Container-query tier of the pane's own width. */
  sizeClass: SizeClass;
  maximized: boolean;
  /** The pane header's slot for this activity's status and actions. */
  headerSlot: HTMLElement | null;
  toggleMaximize: () => void;
  close: () => void;
}

export const ActivityPaneContext = createContext<ActivityPaneValue | null>(
  null
);

/** The enclosing pane, or null when an activity renders outside the layout. */
export const useActivityPane = () => useContext(ActivityPaneContext);

/**
 * Whether the activity is on screen. A hidden tab or pane keeps its editor
 * mounted, so collaboration state survives; it only stops redrawing.
 */
export const useActivityActive = () => useActivityPane()?.active ?? true;
