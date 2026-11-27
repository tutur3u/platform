import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveBoardViewConfig,
  saveBoardConfig,
} from './board-config-storage';
import { DEFAULT_BOARD_FILTERS } from './board-header/board-filter-state';

describe('resolveBoardViewConfig', () => {
  afterEach(() => window.localStorage.clear());

  it('drops malformed saved project IDs before the project lookup', () => {
    const project = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Valid',
    };
    saveBoardConfig('board-1', {
      currentView: 'kanban',
      filters: {
        ...DEFAULT_BOARD_FILTERS,
        projects: [{ id: 'legacy', name: 'Legacy' }, project],
      },
      listStatusFilter: 'all',
    });

    const config = resolveBoardViewConfig({
      boardId: 'board-1',
      enabledViews: null,
      hideEmptyTaskListsByDefault: false,
      viewIsEnabled: () => true,
    });
    expect(config.filters.projects).toEqual([project]);
  });
});
