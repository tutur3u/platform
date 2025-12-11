import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchEmailItem, BatchProgress, BatchResult } from '../batch';
import { createBatch, EmailBatch, sendToMany } from '../batch';

// Mock the email builder
vi.mock('../builder', () => ({
  email: vi.fn(() => ({
    to: vi.fn().mockReturnThis(),
    cc: vi.fn().mockReturnThis(),
    bcc: vi.fn().mockReturnThis(),
    subject: vi.fn().mockReturnThis(),
    html: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    template: vi.fn().mockReturnThis(),
    entity: vi.fn().mockReturnThis(),
    priority: vi.fn().mockReturnThis(),
    userId: vi.fn().mockReturnThis(),
    ip: vi.fn().mockReturnThis(),
    asInvite: vi.fn().mockReturnThis(),
    send: vi
      .fn()
      .mockResolvedValue({ success: true, messageId: 'test-msg-id' }),
  })),
}));

describe('Email Batch Processing', () => {
  const testWsId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EmailBatch', () => {
    describe('constructor', () => {
      it('creates batch with default options', () => {
        const batch = new EmailBatch(testWsId);
        expect(batch.size).toBe(0);
      });

      it('creates batch with custom options', () => {
        const batch = new EmailBatch(testWsId, {
          concurrency: 10,
          delayMs: 200,
          stopOnError: true,
        });
        expect(batch.size).toBe(0);
      });
    });

    describe('add()', () => {
      it('adds single item to batch', () => {
        const batch = new EmailBatch(testWsId);
        batch.add({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        });
        expect(batch.size).toBe(1);
      });

      it('supports method chaining', () => {
        const batch = new EmailBatch(testWsId)
          .add({ to: 'a@example.com', subject: 'Test', html: '<p>A</p>' })
          .add({ to: 'b@example.com', subject: 'Test', html: '<p>B</p>' });
        expect(batch.size).toBe(2);
      });

      it('adds item with all fields', () => {
        const batch = new EmailBatch(testWsId);
        batch.add({
          to: ['to@example.com'],
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
          subject: 'Full Test',
          html: '<p>Hello</p>',
          text: 'Hello',
          source: { name: 'Sender', email: 'sender@example.com' },
          metadata: { templateType: 'test', priority: 'high' },
        });
        expect(batch.size).toBe(1);
      });
    });

    describe('addMany()', () => {
      it('adds multiple items at once', () => {
        const batch = new EmailBatch(testWsId);
        batch.addMany([
          { to: 'a@example.com', subject: 'Test', html: '<p>A</p>' },
          { to: 'b@example.com', subject: 'Test', html: '<p>B</p>' },
          { to: 'c@example.com', subject: 'Test', html: '<p>C</p>' },
        ]);
        expect(batch.size).toBe(3);
      });

      it('supports method chaining', () => {
        const batch = new EmailBatch(testWsId)
          .addMany([{ to: 'a@example.com', subject: 'Test', html: '<p>A</p>' }])
          .addMany([
            { to: 'b@example.com', subject: 'Test', html: '<p>B</p>' },
          ]);
        expect(batch.size).toBe(2);
      });
    });

    describe('clear()', () => {
      it('removes all items from batch', () => {
        const batch = new EmailBatch(testWsId);
        batch.add({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        });
        batch.add({
          to: 'test2@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        });
        expect(batch.size).toBe(2);

        batch.clear();
        expect(batch.size).toBe(0);
      });

      it('supports method chaining', () => {
        const batch = new EmailBatch(testWsId)
          .add({
            to: 'test@example.com',
            subject: 'Test',
            html: '<p>Hello</p>',
          })
          .clear()
          .add({ to: 'new@example.com', subject: 'Test', html: '<p>New</p>' });
        expect(batch.size).toBe(1);
      });
    });

    describe('size getter', () => {
      it('returns current batch size', () => {
        const batch = new EmailBatch(testWsId);
        expect(batch.size).toBe(0);

        batch.add({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        });
        expect(batch.size).toBe(1);

        batch.add({
          to: 'test2@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        });
        expect(batch.size).toBe(2);
      });
    });

    describe('allItems getter', () => {
      it('returns copy of all items', () => {
        const batch = new EmailBatch(testWsId);
        const item1: BatchEmailItem = {
          to: 'a@example.com',
          subject: 'Test',
          html: '<p>A</p>',
        };
        const item2: BatchEmailItem = {
          to: 'b@example.com',
          subject: 'Test',
          html: '<p>B</p>',
        };

        batch.add(item1).add(item2);

        const items = batch.allItems;
        expect(items).toHaveLength(2);
        expect(items[0]).toEqual(item1);
        expect(items[1]).toEqual(item2);
      });

      it('returns independent copy', () => {
        const batch = new EmailBatch(testWsId);
        batch.add({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        });

        const items = batch.allItems;
        items.push({
          to: 'new@example.com',
          subject: 'Test',
          html: '<p>New</p>',
        });

        expect(batch.size).toBe(1); // Original unchanged
      });
    });

    describe('send()', () => {
      it('sends all items in batch', async () => {
        const batch = new EmailBatch(testWsId);
        batch.add({ to: 'a@example.com', subject: 'Test', html: '<p>A</p>' });
        batch.add({ to: 'b@example.com', subject: 'Test', html: '<p>B</p>' });

        const result = await batch.send();

        expect(result.success).toBe(true);
        expect(result.totalSent).toBe(2);
        expect(result.totalFailed).toBe(0);
        expect(result.results).toHaveLength(2);
      });

      it('returns result with duration', async () => {
        const batch = new EmailBatch(testWsId);
        batch.add({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        });

        const result = await batch.send();

        expect(typeof result.duration).toBe('number');
        expect(result.duration).toBeGreaterThanOrEqual(0);
      });

      it('calls progress callback', async () => {
        const onProgress = vi.fn();
        const batch = new EmailBatch(testWsId, { onProgress, concurrency: 1 });

        batch.add({ to: 'a@example.com', subject: 'Test', html: '<p>A</p>' });
        batch.add({ to: 'b@example.com', subject: 'Test', html: '<p>B</p>' });

        await batch.send();

        expect(onProgress).toHaveBeenCalled();
        const lastCall = onProgress.mock.calls[
          onProgress.mock.calls.length - 1
        ]?.[0] as BatchProgress;
        expect(lastCall.total).toBe(2);
        expect(lastCall.percentComplete).toBe(100);
      });

      it('calls item complete callback', async () => {
        const onItemComplete = vi.fn();
        const batch = new EmailBatch(testWsId, { onItemComplete });

        batch.add({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        });

        await batch.send();

        expect(onItemComplete).toHaveBeenCalledTimes(1);
        expect(onItemComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            index: 0,
            item: expect.objectContaining({ to: 'test@example.com' }),
            result: expect.objectContaining({ success: true }),
          })
        );
      });

      it('handles empty batch', async () => {
        const batch = new EmailBatch(testWsId);
        const result = await batch.send();

        expect(result.success).toBe(true);
        expect(result.totalSent).toBe(0);
        expect(result.totalFailed).toBe(0);
        expect(result.results).toHaveLength(0);
      });

      it('respects concurrency setting', async () => {
        const batch = new EmailBatch(testWsId, { concurrency: 2, delayMs: 0 });

        for (let i = 0; i < 5; i++) {
          batch.add({
            to: `user${i}@example.com`,
            subject: 'Test',
            html: '<p>Hello</p>',
          });
        }

        const result = await batch.send();

        expect(result.totalSent).toBe(5);
      });
    });
  });

  describe('createBatch()', () => {
    it('creates EmailBatch instance', () => {
      const batch = createBatch(testWsId);
      expect(batch).toBeInstanceOf(EmailBatch);
    });

    it('passes options to EmailBatch', () => {
      const onProgress = vi.fn();
      const batch = createBatch(testWsId, {
        concurrency: 10,
        onProgress,
      });

      expect(batch).toBeInstanceOf(EmailBatch);
    });

    it('supports fluent usage', async () => {
      const result = await createBatch(testWsId)
        .add({ to: 'a@example.com', subject: 'Test', html: '<p>A</p>' })
        .add({ to: 'b@example.com', subject: 'Test', html: '<p>B</p>' })
        .send();

      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(2);
    });
  });

  describe('sendToMany()', () => {
    it('sends same content to multiple recipients', async () => {
      const result = await sendToMany(
        testWsId,
        ['a@example.com', 'b@example.com', 'c@example.com'],
        {
          subject: 'Newsletter',
          html: '<p>Newsletter content</p>',
        }
      );

      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(3);
    });

    it('accepts optional text content', async () => {
      const result = await sendToMany(testWsId, ['test@example.com'], {
        subject: 'Test',
        html: '<p>HTML</p>',
        text: 'Plain text',
      });

      expect(result.success).toBe(true);
    });

    it('accepts custom source', async () => {
      const result = await sendToMany(
        testWsId,
        ['test@example.com'],
        {
          subject: 'Test',
          html: '<p>Hello</p>',
        },
        {
          source: { name: 'Newsletter', email: 'news@example.com' },
        }
      );

      expect(result.success).toBe(true);
    });

    it('accepts metadata', async () => {
      const result = await sendToMany(
        testWsId,
        ['test@example.com'],
        {
          subject: 'Test',
          html: '<p>Hello</p>',
        },
        {
          metadata: { templateType: 'newsletter' },
        }
      );

      expect(result.success).toBe(true);
    });

    it('accepts progress callback', async () => {
      const onProgress = vi.fn();

      await sendToMany(
        testWsId,
        ['a@example.com', 'b@example.com'],
        {
          subject: 'Test',
          html: '<p>Hello</p>',
        },
        { onProgress }
      );

      expect(onProgress).toHaveBeenCalled();
    });

    it('handles empty recipients', async () => {
      const result = await sendToMany(testWsId, [], {
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(0);
    });
  });

  describe('BatchResult', () => {
    it('contains all expected fields', async () => {
      const batch = createBatch(testWsId);
      batch.add({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      const result: BatchResult = await batch.send();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('totalSent');
      expect(result).toHaveProperty('totalFailed');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('duration');
    });
  });

  describe('BatchProgress', () => {
    it('contains all expected fields', async () => {
      let capturedProgress: BatchProgress | null = null;

      const batch = createBatch(testWsId, {
        onProgress: (progress) => {
          capturedProgress = progress;
        },
      });
      batch.add({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      await batch.send();

      expect(capturedProgress).not.toBeNull();
      expect(capturedProgress).toHaveProperty('total');
      expect(capturedProgress).toHaveProperty('sent');
      expect(capturedProgress).toHaveProperty('failed');
      expect(capturedProgress).toHaveProperty('remaining');
      expect(capturedProgress).toHaveProperty('percentComplete');
    });
  });
});
