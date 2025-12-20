/**
 * Email Batch Processing
 *
 * Efficient batch sending with concurrency control,
 * progress tracking, and error recovery.
 *
 * @example
 * ```typescript
 * import { EmailBatch } from '@tuturuuu/email-service';
 *
 * const batch = new EmailBatch(wsId, {
 *   concurrency: 5,
 *   onProgress: (progress) => console.log(`${progress.sent}/${progress.total} sent`),
 * });
 *
 * batch.add({
 *   to: 'user1@example.com',
 *   subject: 'Hello',
 *   html: '<p>World</p>',
 * });
 *
 * batch.add({
 *   to: 'user2@example.com',
 *   subject: 'Hello',
 *   html: '<p>World</p>',
 * });
 *
 * const results = await batch.send();
 * ```
 */

import { email } from './builder';
import type { EmailMetadata, EmailSource, SendEmailResult } from './types';

// =============================================================================
// Types
// =============================================================================

export interface BatchEmailItem {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  source?: EmailSource;
  metadata?: Partial<Omit<EmailMetadata, 'wsId'>>;
}

export interface BatchProgress {
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  percentComplete: number;
}

export interface BatchResult {
  success: boolean;
  totalSent: number;
  totalFailed: number;
  results: BatchItemResult[];
  duration: number;
}

export interface BatchItemResult {
  index: number;
  item: BatchEmailItem;
  result: SendEmailResult;
}

export interface BatchOptions {
  /** Maximum concurrent sends (default: 5) */
  concurrency?: number;
  /** Delay between sends in ms (default: 100) */
  delayMs?: number;
  /** Stop on first error (default: false) */
  stopOnError?: boolean;
  /** Progress callback */
  onProgress?: (progress: BatchProgress) => void;
  /** Per-item callback */
  onItemComplete?: (result: BatchItemResult) => void;
  /** Base metadata for all items */
  baseMetadata?: Partial<Omit<EmailMetadata, 'wsId'>>;
}

// =============================================================================
// Email Batch Class
// =============================================================================

export class EmailBatch {
  private items: BatchEmailItem[] = [];
  private wsId: string;
  private options: Required<
    Omit<BatchOptions, 'onProgress' | 'onItemComplete' | 'baseMetadata'>
  > & {
    onProgress?: (progress: BatchProgress) => void;
    onItemComplete?: (result: BatchItemResult) => void;
    baseMetadata?: Partial<Omit<EmailMetadata, 'wsId'>>;
  };

  constructor(wsId: string, options: BatchOptions = {}) {
    this.wsId = wsId;
    this.options = {
      concurrency: options.concurrency ?? 5,
      delayMs: options.delayMs ?? 100,
      stopOnError: options.stopOnError ?? false,
      onProgress: options.onProgress,
      onItemComplete: options.onItemComplete,
      baseMetadata: options.baseMetadata,
    };
  }

  /**
   * Add an email to the batch.
   */
  add(item: BatchEmailItem): this {
    this.items.push(item);
    return this;
  }

  /**
   * Add multiple emails to the batch.
   */
  addMany(items: BatchEmailItem[]): this {
    this.items.push(...items);
    return this;
  }

  /**
   * Clear all items from the batch.
   */
  clear(): this {
    this.items = [];
    return this;
  }

  /**
   * Get the current batch size.
   */
  get size(): number {
    return this.items.length;
  }

  /**
   * Get all items in the batch.
   */
  get allItems(): BatchEmailItem[] {
    return [...this.items];
  }

  /**
   * Send all emails in the batch with concurrency control.
   */
  async send(): Promise<BatchResult> {
    const startTime = Date.now();
    const results: BatchItemResult[] = [];
    let sent = 0;
    let failed = 0;

    // Create chunks for concurrent processing
    const chunks = this.chunkArray(this.items, this.options.concurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (item, chunkIndex) => {
        const globalIndex = results.length + chunkIndex;

        try {
          const result = await this.sendItem(item);

          const itemResult: BatchItemResult = {
            index: globalIndex,
            item,
            result,
          };

          if (result.success) {
            sent++;
          } else {
            failed++;
          }

          // Call item callback
          this.options.onItemComplete?.(itemResult);

          return itemResult;
        } catch (error) {
          failed++;
          const errorResult: BatchItemResult = {
            index: globalIndex,
            item,
            result: {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          };

          this.options.onItemComplete?.(errorResult);

          if (this.options.stopOnError) {
            throw error;
          }

          return errorResult;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      // Report progress
      this.options.onProgress?.({
        total: this.items.length,
        sent,
        failed,
        remaining: this.items.length - results.length,
        percentComplete: Math.round((results.length / this.items.length) * 100),
      });

      // Delay between chunks (not after last chunk)
      if (
        chunks.indexOf(chunk) < chunks.length - 1 &&
        this.options.delayMs > 0
      ) {
        await this.delay(this.options.delayMs);
      }
    }

    return {
      success: failed === 0,
      totalSent: sent,
      totalFailed: failed,
      results,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Send a single item using the email builder.
   */
  private async sendItem(item: BatchEmailItem): Promise<SendEmailResult> {
    const builder = email().to(item.to).subject(item.subject).html(item.html);

    if (item.cc) builder.cc(item.cc);
    if (item.bcc) builder.bcc(item.bcc);
    if (item.text) builder.text(item.text);
    if (item.source) builder.from(item.source.email, item.source.name);

    // Apply base metadata
    if (this.options.baseMetadata) {
      if (this.options.baseMetadata.templateType) {
        builder.template(this.options.baseMetadata.templateType);
      }
      if (this.options.baseMetadata.userId) {
        builder.userId(this.options.baseMetadata.userId);
      }
      if (this.options.baseMetadata.ipAddress) {
        builder.ip(this.options.baseMetadata.ipAddress);
      }
      if (this.options.baseMetadata.priority) {
        builder.priority(this.options.baseMetadata.priority);
      }
    }

    // Apply item-specific metadata
    if (item.metadata) {
      if (item.metadata.templateType)
        builder.template(item.metadata.templateType);
      if (item.metadata.entityType) {
        builder.entity(item.metadata.entityType, item.metadata.entityId);
      }
      if (item.metadata.userId) builder.userId(item.metadata.userId);
      if (item.metadata.ipAddress) builder.ip(item.metadata.ipAddress);
      if (item.metadata.priority) builder.priority(item.metadata.priority);
      if (item.metadata.isInvite) builder.asInvite();
    }

    return builder.send(this.wsId);
  }

  /**
   * Split array into chunks.
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Promise-based delay.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new email batch.
 *
 * @example
 * ```typescript
 * const results = await createBatch(wsId)
 *   .add({ to: 'user1@example.com', subject: 'Hello', html: '<p>World</p>' })
 *   .add({ to: 'user2@example.com', subject: 'Hello', html: '<p>World</p>' })
 *   .send();
 * ```
 */
export function createBatch(wsId: string, options?: BatchOptions): EmailBatch {
  return new EmailBatch(wsId, options);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Send the same email to multiple recipients efficiently.
 * Each recipient gets their own email (not CC'd together).
 */
export async function sendToMany(
  wsId: string,
  recipients: string[],
  content: { subject: string; html: string; text?: string },
  options?: {
    concurrency?: number;
    source?: EmailSource;
    metadata?: Partial<Omit<EmailMetadata, 'wsId'>>;
    onProgress?: (progress: BatchProgress) => void;
  }
): Promise<BatchResult> {
  const batch = new EmailBatch(wsId, {
    concurrency: options?.concurrency,
    onProgress: options?.onProgress,
    baseMetadata: options?.metadata,
  });

  for (const to of recipients) {
    batch.add({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      source: options?.source,
    });
  }

  return batch.send();
}
