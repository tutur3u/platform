import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingItemTab } from '../settings-item-tab';
import {
  SettingsSection,
  SettingsSectionFooter,
  SettingsSectionMessage,
} from '../settings-section';

describe('SettingsSection', () => {
  it('renders its heading above a divided card', () => {
    render(
      <SettingsSection description="Details" title="Group">
        <SettingItemTab title="First" />
        <SettingItemTab title="Second" />
      </SettingsSection>
    );

    const card = screen
      .getByText('First')
      .closest('[data-slot="settings-card"]');

    expect(screen.getByRole('heading', { name: 'Group' })).toBeVisible();
    expect(screen.getByText('Details')).toBeVisible();
    expect(card).toHaveClass('divide-y');
    expect(card?.children).toHaveLength(2);
  });

  it('omits the heading block without a title, description or action', () => {
    render(
      <SettingsSection>
        <SettingItemTab title="Only row" />
      </SettingsSection>
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('places the heading action beside the title', () => {
    render(
      <SettingsSection
        action={<button type="button">Add</button>}
        title="Group"
      >
        <SettingItemTab title="Row" />
      </SettingsSection>
    );

    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
  });
});

describe('SettingsSection parts', () => {
  it('keeps dividers on rows wrapped in a form', () => {
    render(
      <SettingsSection>
        <form aria-label="Rows">
          <SettingItemTab title="First" />
        </form>
      </SettingsSection>
    );

    expect(
      screen.getByRole('form', { name: 'Rows' }).parentElement
    ).toHaveClass('[&>form]:divide-y');
  });

  it('renders footer actions after the rows', () => {
    render(
      <SettingsSection>
        <SettingItemTab title="Row" />
        <SettingsSectionFooter>
          <button type="submit">Save</button>
        </SettingsSectionFooter>
      </SettingsSection>
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  it('announces error messages and offers their action', () => {
    render(
      <SettingsSectionMessage
        action={<button type="button">Retry</button>}
        tone="error"
      >
        Failed
      </SettingsSectionMessage>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('keeps muted messages out of the alert role', () => {
    render(<SettingsSectionMessage>Nothing yet</SettingsSectionMessage>);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing yet')).toBeVisible();
  });
});

describe('SettingItemTab', () => {
  it('stacks the control under the label by default', () => {
    const { container } = render(
      <SettingItemTab title="Row">
        <span>Control</span>
      </SettingItemTab>
    );

    expect(container.querySelector('.\\@lg\\:flex-row')).toBeNull();
  });

  it('keeps an inline control beside the label on wide rows', () => {
    const { container } = render(
      <SettingItemTab layout="inline" title="Row">
        <span>Control</span>
      </SettingItemTab>
    );

    expect(container.querySelector('.\\@lg\\:flex-row')).not.toBeNull();
  });

  it('applies the control width to the control area', () => {
    render(
      <SettingItemTab controlWidth="xl" layout="inline" title="Row">
        <span>Control</span>
      </SettingItemTab>
    );

    expect(screen.getByText('Control').parentElement).toHaveClass('@lg:w-80');
  });

  it('accepts a composed description', () => {
    render(
      <SettingItemTab
        description={<span data-testid="description">Help</span>}
        title="Row"
      />
    );

    expect(screen.getByTestId('description')).toBeVisible();
  });
});
