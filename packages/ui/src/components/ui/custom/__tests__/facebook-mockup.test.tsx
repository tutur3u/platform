import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacebookMockup from '../facebook-mockup/facebook-mockup';

const translations: Record<string, string> = {
  'common.download': 'Download',
  'common.reset': 'Reset',
  'facebook_mockup.actions.remove': 'Remove',
  'facebook_mockup.actions.replace': 'Replace',
  'facebook_mockup.actions.upload': 'Upload',
  'facebook_mockup.actions.move_down': 'Move down',
  'facebook_mockup.actions.move_up': 'Move up',
  'facebook_mockup.defaults.audience_label': 'Public',
  'facebook_mockup.defaults.caption':
    'Tuturuuu turns a single creative into a polished Facebook desktop mockup in seconds.',
  'facebook_mockup.defaults.comments_count': '18',
  'facebook_mockup.defaults.cta_label': 'Learn More',
  'facebook_mockup.defaults.description':
    'Desktop-first previews for launches, page posts, education, and product campaigns.',
  'facebook_mockup.defaults.headline': 'A Tuturuuu Facebook mockup preview',
  'facebook_mockup.defaults.page_handle': '@tuturuuu',
  'facebook_mockup.defaults.page_name': 'Tuturuuu',
  'facebook_mockup.defaults.reactions_count': '124',
  'facebook_mockup.defaults.shares_count': '7',
  'facebook_mockup.defaults.sponsored_label': 'Sponsored',
  'facebook_mockup.description':
    'Switch between a desktop ad preview and a desktop page post preview.',
  'facebook_mockup.errors.file_too_large': 'Images must be {size} or smaller.',
  'facebook_mockup.errors.invalid_type': 'Use PNG, JPG, or WEBP images.',
  'facebook_mockup.fields.audience_label': 'Audience label',
  'facebook_mockup.fields.avatar_image': 'Avatar image',
  'facebook_mockup.fields.caption': 'Caption',
  'facebook_mockup.fields.comments': 'comments',
  'facebook_mockup.fields.creative_image': 'Creative image',
  'facebook_mockup.fields.cta_label': 'CTA label',
  'facebook_mockup.fields.description': 'Description',
  'facebook_mockup.fields.headline': 'Headline',
  'facebook_mockup.fields.page_handle': 'Page handle',
  'facebook_mockup.fields.page_name': 'Page name',
  'facebook_mockup.fields.preview_theme': 'Preview theme',
  'facebook_mockup.fields.preview_type': 'Preview type',
  'facebook_mockup.fields.preview_viewport': 'Viewport',
  'facebook_mockup.fields.reactions': 'reactions',
  'facebook_mockup.fields.shares': 'shares',
  'facebook_mockup.fields.sponsored_label': 'Sponsored label',
  'facebook_mockup.fullscreen.close': 'Close fullscreen',
  'facebook_mockup.fullscreen.description':
    'Preview and export the mockup with desktop, tablet, or phone framing.',
  'facebook_mockup.fullscreen.open': 'Fullscreen preview',
  'facebook_mockup.fullscreen.title': 'Fullscreen Preview',
  'facebook_mockup.helper_text.drag_reactions':
    'Drag reactions to change the order they appear in the summary bar.',
  'facebook_mockup.helper_text.upload_image': 'PNG, JPG, or WEBP up to {size}.',
  'facebook_mockup.modes.ad': 'Facebook ad',
  'facebook_mockup.modes.page': 'Desktop page post',
  'facebook_mockup.placeholders.audience_label': 'Public',
  'facebook_mockup.placeholders.caption': 'Write your ad copy or post caption',
  'facebook_mockup.placeholders.cta_label': 'Learn More',
  'facebook_mockup.placeholders.description':
    'Describe the supporting copy that appears under the image.',
  'facebook_mockup.placeholders.headline':
    'Add the short headline under the image',
  'facebook_mockup.placeholders.metric_value': '0',
  'facebook_mockup.placeholders.page_handle': '@yourpage',
  'facebook_mockup.placeholders.page_name': 'Page name',
  'facebook_mockup.placeholders.sponsored_label': 'Sponsored',
  'facebook_mockup.preview.actions_comment': 'Comment',
  'facebook_mockup.preview.actions_like': 'Like',
  'facebook_mockup.preview.actions_share': 'Share',
  'facebook_mockup.preview.avatar_alt': 'Preview page avatar',
  'facebook_mockup.preview.close': 'Close',
  'facebook_mockup.preview.browser_title': 'facebook mockup preview',
  'facebook_mockup.preview.creative_alt': 'Preview creative image',
  'facebook_mockup.preview.desktop_label': 'Desktop preview',
  'facebook_mockup.preview.feed_label': 'News Feed',
  'facebook_mockup.preview.more_actions': 'More actions',
  'facebook_mockup.preview.placeholder_avatar': 'Avatar',
  'facebook_mockup.preview.placeholder_image': 'Creative image',
  'facebook_mockup.preview.search_placeholder': 'Search Facebook',
  'facebook_mockup.preview.see_more': 'See more',
  'facebook_mockup.preview.show_less': 'See less',
  'facebook_mockup.preview_themes.dark': 'Dark mode',
  'facebook_mockup.preview_themes.light': 'Light mode',
  'facebook_mockup.reactions.angry': 'Angry',
  'facebook_mockup.reactions.care': 'Care',
  'facebook_mockup.reactions.haha': 'Haha',
  'facebook_mockup.reactions.like': 'Like',
  'facebook_mockup.reactions.love': 'Love',
  'facebook_mockup.reactions.sad': 'Sad',
  'facebook_mockup.reactions.wow': 'Wow',
  'facebook_mockup.sections.content': 'Content',
  'facebook_mockup.sections.identity': 'Page identity',
  'facebook_mockup.sections.media': 'Media',
  'facebook_mockup.sections.performance': 'Performance',
  'facebook_mockup.sections.reactions': 'Visible reactions',
  'facebook_mockup.title': 'Facebook Mockup Tool',
  'facebook_mockup.viewport_modes.desktop': 'Desktop',
  'facebook_mockup.viewport_modes.phone': 'Phone',
  'facebook_mockup.viewport_modes.tablet': 'Tablet',
};

const html2canvasMock = vi.fn(async () => ({
  toDataURL: vi.fn(() => 'data:image/png;base64,mock'),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    let value = translations[key] ?? key;
    if (values) {
      for (const [name, replacement] of Object.entries(values)) {
        value = value.replace(`{${name}}`, replacement);
      }
    }
    return value;
  },
}));

vi.mock('html2canvas-pro', () => ({
  default: html2canvasMock,
}));

describe('FacebookMockup', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders in ad mode by default and switches to page mode', async () => {
    render(<FacebookMockup />);

    expect(screen.getByRole('button', { name: 'Facebook ad' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByDisplayValue('A Tuturuuu Facebook mockup preview')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Desktop page post' }));

    await waitFor(() =>
      expect(screen.queryByLabelText('Headline')).not.toBeInTheDocument()
    );
    expect(
      within(screen.getByTestId('facebook-mockup-preview')).getByText('Like')
    ).toBeInTheDocument();
  });

  it('updates the live preview when text fields change', () => {
    render(<FacebookMockup />);
    const preview = within(screen.getByTestId('facebook-mockup-post-card'));

    fireEvent.change(screen.getByLabelText('Page name'), {
      target: { value: 'Computer City' },
    });
    fireEvent.change(screen.getByLabelText('Caption'), {
      target: { value: 'Desktop preview tuned for computer store campaigns.' },
    });

    expect(preview.getByText('Computer City')).toBeInTheDocument();
    expect(
      preview.getByText('Desktop preview tuned for computer store campaigns.')
    ).toBeInTheDocument();
  });

  it('shows uploaded avatar and creative images in the preview', async () => {
    render(<FacebookMockup />);
    const preview = within(screen.getByTestId('facebook-mockup-post-card'));

    fireEvent.change(screen.getByLabelText('Avatar image'), {
      target: {
        files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })],
      },
    });
    fireEvent.change(screen.getByLabelText('Creative image'), {
      target: {
        files: [new File(['creative'], 'creative.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(preview.getByAltText('Preview page avatar')).toHaveAttribute(
        'src',
        'blob:avatar.png'
      );
      expect(preview.getByAltText('Preview creative image')).toHaveAttribute(
        'src',
        'blob:creative.png'
      );
    });
  });

  it('resets the editor back to its translated defaults', async () => {
    render(<FacebookMockup />);

    fireEvent.change(screen.getByLabelText('Page name'), {
      target: { value: 'Changed Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Page name')).toHaveValue('Tuturuuu')
    );
  });

  it('shows only individually enabled reactions in the preview', async () => {
    render(<FacebookMockup />);
    const preview = within(screen.getByTestId('facebook-mockup-post-card'));

    expect(preview.getAllByLabelText('reaction-badge')).toHaveLength(3);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Care' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Love' }));

    await waitFor(() =>
      expect(preview.getAllByLabelText('reaction-badge')).toHaveLength(3)
    );
  });

  it('exports the preview through html2canvas', async () => {
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<FacebookMockup />);

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(html2canvasMock).toHaveBeenCalledTimes(1));
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
  });
});
