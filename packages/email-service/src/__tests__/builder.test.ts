import { describe, expect, it, vi } from 'vitest';

import { EmailBuildError, EmailBuilder, email, isValidEmail } from '../builder';

// Mock the dynamic imports
vi.mock('../index', () => ({
  sendWorkspaceEmail: vi
    .fn()
    .mockResolvedValue({ success: true, messageId: 'test-id' }),
  sendSystemEmail: vi
    .fn()
    .mockResolvedValue({ success: true, messageId: 'system-id' }),
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  ROOT_WORKSPACE_ID: '00000000-0000-0000-0000-000000000000',
}));

describe('Email Builder', () => {
  const testWsId = '123e4567-e89b-12d3-a456-426614174000';

  describe('email() factory function', () => {
    it('creates a new EmailBuilder instance', () => {
      const builder = email();
      expect(builder).toBeInstanceOf(EmailBuilder);
    });
  });

  describe('EmailBuilder recipients', () => {
    it('sets to recipients with string', () => {
      const builder = email().to('test@example.com');
      expect(builder.recipientCount).toBe(1);
    });

    it('sets to recipients with array', () => {
      const builder = email().to(['a@example.com', 'b@example.com']);
      expect(builder.recipientCount).toBe(2);
    });

    it('adds cc recipients', () => {
      const builder = email().to('to@example.com').cc('cc@example.com');
      expect(builder.recipientCount).toBe(2);
    });

    it('adds multiple cc recipients', () => {
      const builder = email()
        .to('to@example.com')
        .cc('cc1@example.com')
        .cc(['cc2@example.com', 'cc3@example.com']);
      expect(builder.recipientCount).toBe(4);
    });

    it('adds bcc recipients', () => {
      const builder = email().to('to@example.com').bcc('bcc@example.com');
      expect(builder.recipientCount).toBe(2);
    });

    it('sets replyTo', () => {
      const builder = email().to('to@example.com').replyTo('reply@example.com');
      // replyTo doesn't count as a recipient
      expect(builder.recipientCount).toBe(1);
    });
  });

  describe('EmailBuilder content', () => {
    it('sets subject', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test Subject')
        .html('<p>Hello</p>');
      expect(builder.isValid).toBe(true);
    });

    it('trims subject whitespace', () => {
      const builder = email()
        .to('test@example.com')
        .subject('  Trimmed Subject  ')
        .html('<p>Hello</p>');
      const params = builder.build(testWsId);
      expect(params.content.subject).toBe('Trimmed Subject');
    });

    it('sets html content', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello World</p>');
      expect(builder.isValid).toBe(true);
    });

    it('sets text content', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .text('Hello');
      const params = builder.build(testWsId);
      expect(params.content.text).toBe('Hello');
    });
  });

  describe('EmailBuilder source', () => {
    it('sets from with email only', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .from('sender@example.com');
      const params = builder.build(testWsId);
      expect(params.source?.email).toBe('sender@example.com');
    });

    it('sets from with email and name', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .from('sender@example.com', 'Sender Name');
      const params = builder.build(testWsId);
      expect(params.source?.email).toBe('sender@example.com');
      expect(params.source?.name).toBe('Sender Name');
    });

    it('normalizes from email to lowercase', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .from('SENDER@EXAMPLE.COM');
      const params = builder.build(testWsId);
      expect(params.source?.email).toBe('sender@example.com');
    });
  });

  describe('EmailBuilder metadata', () => {
    it('sets template type', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .template('welcome');
      const params = builder.build(testWsId);
      expect(params.metadata.templateType).toBe('welcome');
    });

    it('sets entity reference', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .entity('invoice', '123e4567-e89b-12d3-a456-426614174001');
      const params = builder.build(testWsId);
      expect(params.metadata.entityType).toBe('invoice');
      expect(params.metadata.entityId).toBe(
        '123e4567-e89b-12d3-a456-426614174001'
      );
    });

    it('sets entity without id', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .entity('notification');
      const params = builder.build(testWsId);
      expect(params.metadata.entityType).toBe('notification');
      expect(params.metadata.entityId).toBeUndefined();
    });

    it('sets priority', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .priority('high');
      const params = builder.build(testWsId);
      expect(params.metadata.priority).toBe('high');
    });

    it('sets as invite', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .asInvite();
      const params = builder.build(testWsId);
      expect(params.metadata.isInvite).toBe(true);
      expect(params.metadata.templateType).toBe('workspace-invite');
    });

    it('sets userId', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .userId('123e4567-e89b-12d3-a456-426614174001');
      const params = builder.build(testWsId);
      expect(params.metadata.userId).toBe(
        '123e4567-e89b-12d3-a456-426614174001'
      );
    });

    it('sets ip address', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .ip('192.168.1.1');
      const params = builder.build(testWsId);
      expect(params.metadata.ipAddress).toBe('192.168.1.1');
    });

    it('sets user agent', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .userAgent('Mozilla/5.0');
      const params = builder.build(testWsId);
      expect(params.metadata.userAgent).toBe('Mozilla/5.0');
    });
  });

  describe('EmailBuilder.build()', () => {
    it('builds valid email params', () => {
      const params = email()
        .to('test@example.com')
        .subject('Test Subject')
        .html('<p>Hello</p>')
        .build(testWsId);

      expect(params.recipients.to).toContain('test@example.com');
      expect(params.content.subject).toBe('Test Subject');
      expect(params.content.html).toBe('<p>Hello</p>');
      expect(params.metadata.wsId).toBe(testWsId);
    });

    it('throws EmailBuildError for missing recipients', () => {
      expect(() => {
        email().subject('Test').html('<p>Hello</p>').build(testWsId);
      }).toThrow(EmailBuildError);
    });

    it('throws EmailBuildError for missing subject', () => {
      expect(() => {
        email().to('test@example.com').html('<p>Hello</p>').build(testWsId);
      }).toThrow(EmailBuildError);
    });

    it('throws EmailBuildError for missing html', () => {
      expect(() => {
        email().to('test@example.com').subject('Test').build(testWsId);
      }).toThrow(EmailBuildError);
    });

    it('EmailBuildError contains validation errors', () => {
      try {
        email().subject('Test').html('<p>Hello</p>').build(testWsId);
      } catch (error) {
        expect(error).toBeInstanceOf(EmailBuildError);
        if (error instanceof EmailBuildError) {
          expect(Array.isArray(error.validationErrors)).toBe(true);
          expect(error.validationErrors.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('EmailBuilder.validate()', () => {
    it('returns empty array for valid email', () => {
      const errors = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .validate(testWsId);
      expect(errors).toHaveLength(0);
    });

    it('returns errors for invalid email', () => {
      const errors = email()
        .subject('Test')
        .html('<p>Hello</p>')
        .validate(testWsId);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('EmailBuilder.isValid', () => {
    it('returns true when minimum fields are set', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>');
      expect(builder.isValid).toBe(true);
    });

    it('returns false when to is missing', () => {
      const builder = email().subject('Test').html('<p>Hello</p>');
      expect(builder.isValid).toBe(false);
    });

    it('returns false when subject is missing', () => {
      const builder = email().to('test@example.com').html('<p>Hello</p>');
      expect(builder.isValid).toBe(false);
    });

    it('returns false when html is missing', () => {
      const builder = email().to('test@example.com').subject('Test');
      expect(builder.isValid).toBe(false);
    });
  });

  describe('EmailBuilder.clone()', () => {
    it('creates an independent copy', () => {
      const original = email()
        .to('original@example.com')
        .subject('Original')
        .html('<p>Original</p>');

      const cloned = original.clone();
      cloned.to('cloned@example.com');
      cloned.subject('Cloned');

      const originalParams = original.build(testWsId);
      const clonedParams = cloned.build(testWsId);

      expect(originalParams.recipients.to).toContain('original@example.com');
      expect(clonedParams.recipients.to).toContain('cloned@example.com');
    });
  });

  describe('EmailBuilder.reset()', () => {
    it('resets builder to initial state', () => {
      const builder = email()
        .to('test@example.com')
        .subject('Test')
        .html('<p>Hello</p>')
        .priority('high');

      builder.reset();

      expect(builder.recipientCount).toBe(0);
      expect(builder.isValid).toBe(false);
    });
  });

  describe('Method chaining', () => {
    it('supports full method chaining', () => {
      const params = email()
        .to('to@example.com')
        .cc('cc@example.com')
        .bcc('bcc@example.com')
        .replyTo('reply@example.com')
        .subject('Full Chain Test')
        .html('<p>Hello</p>')
        .text('Hello')
        .from('sender@example.com', 'Sender')
        .template('test-template')
        .entity('test', '123e4567-e89b-12d3-a456-426614174001')
        .priority('high')
        .userId('123e4567-e89b-12d3-a456-426614174002')
        .ip('192.168.1.1')
        .userAgent('Test Agent')
        .build(testWsId);

      expect(params.recipients.to).toContain('to@example.com');
      expect(params.recipients.cc).toContain('cc@example.com');
      expect(params.recipients.bcc).toContain('bcc@example.com');
      expect(params.content.replyTo).toContain('reply@example.com');
      expect(params.content.subject).toBe('Full Chain Test');
      expect(params.metadata.templateType).toBe('test-template');
      expect(params.metadata.priority).toBe('high');
    });
  });

  describe('isValidEmail export', () => {
    it('validates email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
    });
  });
});
