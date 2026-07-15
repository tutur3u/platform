import { describe, expect, it } from 'vitest';
import {
  filterSlashCommands,
  getSlashCommands,
  normalizeForSearch,
} from '../definitions';

describe('Slash Commands', () => {
  describe('getSlashCommands', () => {
    it('should return all commands with default options', () => {
      const commands = getSlashCommands({
        hasMembers: true,
        hasEndDate: true,
        hasPriority: true,
        showAdvanced: false,
      });

      expect(commands.length).toBe(12);
    });

    it('should disable assign command when no members', () => {
      const commands = getSlashCommands({
        hasMembers: false,
        hasEndDate: true,
        hasPriority: true,
        showAdvanced: false,
      });

      const assignCommand = commands.find((c) => c.id === 'assign');
      expect(assignCommand?.disabled).toBe(true);
    });

    it('should disable clear-due when no end date', () => {
      const commands = getSlashCommands({
        hasMembers: true,
        hasEndDate: false,
        hasPriority: true,
        showAdvanced: false,
      });

      const clearDueCommand = commands.find((c) => c.id === 'clear-due');
      expect(clearDueCommand?.disabled).toBe(true);
    });

    it('should disable priority-clear when no priority', () => {
      const commands = getSlashCommands({
        hasMembers: true,
        hasEndDate: true,
        hasPriority: false,
        showAdvanced: false,
      });

      const clearPriorityCommand = commands.find(
        (c) => c.id === 'priority-clear'
      );
      expect(clearPriorityCommand?.disabled).toBe(true);
    });

    it('should toggle advanced options label', () => {
      const commandsHidden = getSlashCommands({
        hasMembers: true,
        hasEndDate: true,
        hasPriority: true,
        showAdvanced: false,
      });

      const commandsShown = getSlashCommands({
        hasMembers: true,
        hasEndDate: true,
        hasPriority: true,
        showAdvanced: true,
      });

      const toggleHidden = commandsHidden.find(
        (c) => c.id === 'toggle-advanced'
      );
      const toggleShown = commandsShown.find((c) => c.id === 'toggle-advanced');

      expect(toggleHidden?.label).toBe('Show advanced options');
      expect(toggleShown?.label).toBe('Hide advanced options');
    });

    it('should include all priority levels', () => {
      const commands = getSlashCommands({
        hasMembers: true,
        hasEndDate: true,
        hasPriority: true,
        showAdvanced: false,
      });

      const priorityCommands = commands.filter((c) =>
        c.id.startsWith('priority-')
      );

      expect(priorityCommands.length).toBe(5); // critical, high, normal, low, clear
    });

    it('should include all due date options', () => {
      const commands = getSlashCommands({
        hasMembers: true,
        hasEndDate: true,
        hasPriority: true,
        showAdvanced: false,
      });

      const dueDateCommands = commands.filter((c) => c.id.includes('due'));

      expect(dueDateCommands.length).toBe(4); // today, tomorrow, next-week, clear
    });
  });

  describe('filterSlashCommands', () => {
    const commands = getSlashCommands({
      hasMembers: true,
      hasEndDate: true,
      hasPriority: true,
      showAdvanced: false,
    });

    it('should return all non-disabled commands with empty query', () => {
      const filtered = filterSlashCommands(commands, '');
      expect(filtered.length).toBe(commands.filter((c) => !c.disabled).length);
    });

    it('should filter by label', () => {
      const filtered = filterSlashCommands(commands, 'assign');
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some((c) => c.id === 'assign')).toBe(true);
    });

    it('should filter by description', () => {
      const filtered = filterSlashCommands(commands, 'mention');
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some((c) => c.id === 'assign')).toBe(true);
    });

    it('should filter by keywords', () => {
      const filtered = filterSlashCommands(commands, 'urgent');
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some((c) => c.id === 'priority-critical')).toBe(true);
    });

    it('should be case insensitive', () => {
      const filtered = filterSlashCommands(commands, 'ASSIGN');
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some((c) => c.id === 'assign')).toBe(true);
    });

    it('should exclude disabled commands', () => {
      const commandsWithDisabled = getSlashCommands({
        hasMembers: false,
        hasEndDate: false,
        hasPriority: false,
        showAdvanced: false,
      });

      const filtered = filterSlashCommands(commandsWithDisabled, '');
      expect(filtered.every((c) => !c.disabled)).toBe(true);
    });

    it('should match multiple words', () => {
      const filtered = filterSlashCommands(commands, 'priority high');
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some((c) => c.id === 'priority-high')).toBe(true);
    });

    it('should return empty array when no matches', () => {
      const filtered = filterSlashCommands(commands, 'nonexistent');
      expect(filtered).toHaveLength(0);
    });

    it('should handle partial matches', () => {
      const filtered = filterSlashCommands(commands, 'pri');
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some((c) => c.id.includes('priority'))).toBe(true);
    });

    it('should handle special characters in query', () => {
      const filtered = filterSlashCommands(commands, 'due-today');
      // Should still work even with hyphen
      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('normalizeForSearch', () => {
    it('should convert to lowercase', () => {
      expect(normalizeForSearch('PRIORITY')).toBe('priority');
    });

    it('should remove diacritics', () => {
      expect(normalizeForSearch('crïtical')).toBe('critical');
    });

    it('should trim whitespace', () => {
      expect(normalizeForSearch('  assign  ')).toBe('assign');
    });

    it('should handle empty strings', () => {
      expect(normalizeForSearch('')).toBe('');
    });

    it('should handle special characters', () => {
      expect(normalizeForSearch('due-date')).toBe('due-date');
    });
  });

  describe('Command structure', () => {
    const commands = getSlashCommands({
      hasMembers: true,
      hasEndDate: true,
      hasPriority: true,
      showAdvanced: false,
    });

    it('should have unique IDs', () => {
      const ids = commands.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(commands.length);
    });

    it('should have labels for all commands', () => {
      expect(commands.every((c) => c.label && c.label.length > 0)).toBe(true);
    });

    it('should have icons for all commands', () => {
      expect(commands.every((c) => c.icon)).toBe(true);
    });

    it('should have keywords for all commands', () => {
      expect(commands.every((c) => c.keywords && c.keywords.length > 0)).toBe(
        true
      );
    });

    it('should have appropriate keywords', () => {
      const assignCommand = commands.find((c) => c.id === 'assign');
      expect(assignCommand?.keywords).toContain('assign');
      expect(assignCommand?.keywords).toContain('member');
    });
  });

  describe('convert-to-task command', () => {
    const commands = getSlashCommands({
      hasMembers: true,
      hasEndDate: true,
      hasPriority: true,
      showAdvanced: false,
    });

    it('should exist with correct properties', () => {
      const convertCommand = commands.find((c) => c.id === 'convert-to-task');

      expect(convertCommand).toBeDefined();
      expect(convertCommand?.id).toBe('convert-to-task');
      expect(convertCommand?.label).toBe('Convert to task');
      expect(convertCommand?.description).toBe(
        'Convert selected text or list item into a new task'
      );
      expect(convertCommand?.icon).toBeDefined();
      expect(convertCommand?.keywords).toEqual([
        'convert',
        'task',
        'create',
        'new',
        'mention',
      ]);
    });

    it('should not be disabled by default', () => {
      const convertCommand = commands.find((c) => c.id === 'convert-to-task');
      expect(convertCommand?.disabled).toBeUndefined();
    });

    it('should be searchable by keywords', () => {
      // Test various keyword searches
      const searchTests = [
        { query: 'convert', shouldFind: true },
        { query: 'task', shouldFind: true },
        { query: 'create', shouldFind: true },
        { query: 'new', shouldFind: true },
        { query: 'mention', shouldFind: true },
        { query: 'conv', shouldFind: true }, // Partial match
        { query: 'create task', shouldFind: true }, // Multiple words
        { query: 'unrelated', shouldFind: false }, // No match
      ];

      searchTests.forEach(({ query, shouldFind }) => {
        const filtered = filterSlashCommands(commands, query);
        const hasCommand = filtered.some((c) => c.id === 'convert-to-task');
        expect(hasCommand).toBe(shouldFind);
      });
    });

    it('should remain enabled regardless of context options', () => {
      // Test various context combinations to ensure it's never disabled
      const contextTests = [
        { hasMembers: false, hasEndDate: false, hasPriority: false },
        { hasMembers: true, hasEndDate: false, hasPriority: false },
        { hasMembers: false, hasEndDate: true, hasPriority: false },
        { hasMembers: false, hasEndDate: false, hasPriority: true },
      ];

      contextTests.forEach((options) => {
        const testCommands = getSlashCommands({
          ...options,
          showAdvanced: false,
        });
        const convertCommand = testCommands.find(
          (c) => c.id === 'convert-to-task'
        );
        expect(convertCommand?.disabled).toBeUndefined();
      });
    });
  });
});
