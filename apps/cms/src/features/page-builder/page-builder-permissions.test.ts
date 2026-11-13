import { describe, expect, it } from 'vitest';
import { getVisiblePageBuilderActions } from './page-builder-permissions';

const handler = async () => {};

describe('page builder actions', () => {
  it('lets editors save drafts but hides Publish without the publish permission', () => {
    expect(
      getVisiblePageBuilderActions({
        canPublishPages: false,
        onPublish: handler,
        onSaveDraft: handler,
      })
    ).toEqual({ publish: false, saveDraft: true });
  });

  it('shows Publish to publishers once a publish handler is wired', () => {
    expect(
      getVisiblePageBuilderActions({
        canPublishPages: true,
        onPublish: handler,
      })
    ).toEqual({ publish: true, saveDraft: false });
    expect(getVisiblePageBuilderActions({ canPublishPages: true })).toEqual({
      publish: false,
      saveDraft: false,
    });
  });
});
