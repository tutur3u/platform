// Recent items manager for command palette
export interface RecentPage {
  type: 'page';
  href: string;
  title: string;
  timestamp: number;
}

export interface RecentTask {
  type: 'task';
  taskId: string;
  taskName: string;
  boardName?: string;
  timestamp: number;
}

export interface RecentSearch {
  type: 'search';
  query: string;
  timestamp: number;
}

export type RecentItem = RecentPage | RecentTask | RecentSearch;

const RECENT_PAGES_KEY = 'cmdk_recent_pages';
const RECENT_TASKS_KEY = 'cmdk_recent_tasks';
const RECENT_SEARCHES_KEY = 'cmdk_recent_searches';
const MAX_ITEMS = 20;
const EXPIRY_DAYS = 30;

function isExpired(timestamp: number): boolean {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  return now - timestamp > EXPIRY_DAYS * dayInMs;
}

function getFromStorage<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return [];
    const items = JSON.parse(stored) as T[];
    // Filter out expired items
    return items.filter((item: any) => !isExpired(item.timestamp));
  } catch {
    return [];
  }
}

function saveToStorage<T>(key: string, items: T[]) {
  if (typeof window === 'undefined') return;
  try {
    // Keep only the most recent MAX_ITEMS
    const limited = items.slice(0, MAX_ITEMS);
    window.localStorage.setItem(key, JSON.stringify(limited));
  } catch {
    // Ignore storage errors
  }
}

export function addRecentPage(href: string, title: string) {
  const pages = getFromStorage<RecentPage>(RECENT_PAGES_KEY);

  // Remove existing entry for this href
  const filtered = pages.filter((p) => p.href !== href);

  // Add to front
  const newPage: RecentPage = {
    type: 'page',
    href,
    title,
    timestamp: Date.now(),
  };

  saveToStorage(RECENT_PAGES_KEY, [newPage, ...filtered]);
}

export function addRecentTask(
  taskId: string,
  taskName: string,
  boardName?: string
) {
  const tasks = getFromStorage<RecentTask>(RECENT_TASKS_KEY);

  // Remove existing entry for this task
  const filtered = tasks.filter((t) => t.taskId !== taskId);

  // Add to front
  const newTask: RecentTask = {
    type: 'task',
    taskId,
    taskName,
    boardName,
    timestamp: Date.now(),
  };

  saveToStorage(RECENT_TASKS_KEY, [newTask, ...filtered]);
}

export function addRecentSearch(query: string) {
  if (!query.trim()) return;

  const searches = getFromStorage<RecentSearch>(RECENT_SEARCHES_KEY);

  // Remove existing entry for this query
  const filtered = searches.filter((s) => s.query !== query);

  // Add to front
  const newSearch: RecentSearch = {
    type: 'search',
    query,
    timestamp: Date.now(),
  };

  saveToStorage(RECENT_SEARCHES_KEY, [newSearch, ...filtered]);
}

export function getRecentItems(limit = 5): RecentItem[] {
  const pages = getFromStorage<RecentPage>(RECENT_PAGES_KEY);
  const tasks = getFromStorage<RecentTask>(RECENT_TASKS_KEY);
  const searches = getFromStorage<RecentSearch>(RECENT_SEARCHES_KEY);

  // Merge and sort by timestamp
  const allItems: RecentItem[] = [...pages, ...tasks, ...searches];

  allItems.sort((a, b) => b.timestamp - a.timestamp);

  return allItems.slice(0, limit);
}

export function clearRecentPages() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECENT_PAGES_KEY);
  } catch {
    // Ignore
  }
}

export function clearRecentTasks() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECENT_TASKS_KEY);
  } catch {
    // Ignore
  }
}

export function clearRecentSearches() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore
  }
}

export function clearAllRecent() {
  clearRecentPages();
  clearRecentTasks();
  clearRecentSearches();
}

/**
 * Get recency boost score for a given href
 * Returns a score between 0-200 based on how recently the page was visited
 * More recent visits get higher scores
 */
export function getRecencyBoost(href: string): number {
  const pages = getFromStorage<RecentPage>(RECENT_PAGES_KEY);
  const page = pages.find((p) => p.href === href);

  if (!page) return 0;

  const now = Date.now();
  const age = now - page.timestamp;
  const hourInMs = 60 * 60 * 1000;

  // Score decays over time:
  // < 1 hour: +200
  // < 6 hours: +150
  // < 24 hours: +100
  // < 3 days: +50
  // < 7 days: +25
  // older: 0
  if (age < hourInMs) return 200;
  if (age < 6 * hourInMs) return 150;
  if (age < 24 * hourInMs) return 100;
  if (age < 3 * 24 * hourInMs) return 50;
  if (age < 7 * 24 * hourInMs) return 25;
  return 0;
}
