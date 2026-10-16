import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogueEntry } from './catalogue-entry';

afterEach(cleanup);
describe('public staged catalogue', () => {
  it('filters by localized names and aliases with a labelled native search control', () => {
    render(<CatalogueEntry locale="en" />);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Meeting' },
    });
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    ).toContain('/meet');
    expect(screen.queryByRole('link', { name: /Tuturuuu Pay/ })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('1 apps');
  });
  it('combines category and query without losing catalogue source', () => {
    render(<CatalogueEntry locale="en" />);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'operations' },
    });
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'pay' },
    });
    expect(screen.getByRole('link', { name: /Pay/ }).getAttribute('href')).toBe(
      '/pay'
    );
    expect(screen.getByRole('status').textContent).toBe('1 apps');
  });
  it('localizes controls and exposes full account navigation on the original origin', () => {
    render(<CatalogueEntry locale="vi" />);
    expect(screen.getByRole('combobox').getAttribute('id')).toBe(
      'app-category'
    );
    expect(
      screen
        .getByRole('link', { name: /Mở ứng dụng đầy đủ/ })
        .getAttribute('href')
    ).toBe('https://apps.tuturuuu.com/');
    expect(screen.getByRole('navigation', { name: 'Ngôn ngữ' })).toBeTruthy();
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });
});
