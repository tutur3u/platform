import { describe, expect, it } from 'vitest';

import {
  emailAddressSchema,
  emailArraySchema,
  emailContentSchema,
  emailMetadataSchema,
  emailRecipientsSchema,
  emailSourceSchema,
  formatValidationErrors,
  isValidEmail,
  normalizeEmail,
  normalizeEmailArray,
  safeValidateEmailParams,
  sendEmailParamsSchema,
  validateEmailParams,
} from '../validation';

describe('Email Validation', () => {
  describe('emailAddressSchema', () => {
    it('validates correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'a@b.co',
      ];

      validEmails.forEach((email) => {
        const result = emailAddressSchema.safeParse(email);
        expect(result.success).toBe(true);
      });
    });

    it('rejects invalid email addresses', () => {
      const invalidEmails = [
        '',
        'not-an-email',
        '@no-local.com',
        'no-domain@',
        'spaces in@email.com',
        'missing@tld',
      ];

      invalidEmails.forEach((email) => {
        const result = emailAddressSchema.safeParse(email);
        expect(result.success).toBe(false);
      });
    });

    it('normalizes email to lowercase', () => {
      const result = emailAddressSchema.safeParse('Test@EXAMPLE.com');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test@example.com');
      }
    });

    it('rejects email with leading/trailing whitespace', () => {
      // Note: Whitespace is not trimmed before validation, so emails with
      // leading/trailing spaces will fail the regex check
      const result = emailAddressSchema.safeParse('  test@example.com  ');
      expect(result.success).toBe(false);
    });

    it('transforms valid email to lowercase and trimmed', () => {
      // The transform only applies after validation passes
      const result = emailAddressSchema.safeParse('Test@Example.com');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test@example.com');
      }
    });

    it('rejects emails longer than 254 characters', () => {
      const longEmail = `${'a'.repeat(250)}@b.com`;
      const result = emailAddressSchema.safeParse(longEmail);
      expect(result.success).toBe(false);
    });
  });

  describe('emailArraySchema', () => {
    it('validates array of valid emails', () => {
      const result = emailArraySchema.safeParse(['a@b.com', 'c@d.com']);
      expect(result.success).toBe(true);
    });

    it('deduplicates emails', () => {
      const result = emailArraySchema.safeParse([
        'test@example.com',
        'TEST@EXAMPLE.COM',
        'test@example.com',
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toBe('test@example.com');
      }
    });

    it('rejects array with invalid emails', () => {
      const result = emailArraySchema.safeParse([
        'valid@email.com',
        'invalid-email',
      ]);
      expect(result.success).toBe(false);
    });

    it('accepts empty array', () => {
      const result = emailArraySchema.safeParse([]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe('emailRecipientsSchema', () => {
    it('validates recipients with required to field', () => {
      const result = emailRecipientsSchema.safeParse({
        to: ['recipient@example.com'],
      });
      expect(result.success).toBe(true);
    });

    it('validates recipients with all fields', () => {
      const result = emailRecipientsSchema.safeParse({
        to: ['to@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty to array', () => {
      const result = emailRecipientsSchema.safeParse({
        to: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing to field', () => {
      const result = emailRecipientsSchema.safeParse({
        cc: ['cc@example.com'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('emailContentSchema', () => {
    it('validates content with required fields', () => {
      const result = emailContentSchema.safeParse({
        subject: 'Test Subject',
        html: '<p>Hello World</p>',
      });
      expect(result.success).toBe(true);
    });

    it('validates content with all fields', () => {
      const result = emailContentSchema.safeParse({
        subject: 'Test Subject',
        html: '<p>Hello World</p>',
        text: 'Hello World',
        replyTo: ['reply@example.com'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty subject', () => {
      const result = emailContentSchema.safeParse({
        subject: '',
        html: '<p>Hello</p>',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty html', () => {
      const result = emailContentSchema.safeParse({
        subject: 'Subject',
        html: '',
      });
      expect(result.success).toBe(false);
    });

    it('trims subject whitespace', () => {
      const result = emailContentSchema.safeParse({
        subject: '  Test Subject  ',
        html: '<p>Hello</p>',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subject).toBe('Test Subject');
      }
    });
  });

  describe('emailSourceSchema', () => {
    it('validates source with name and email', () => {
      const result = emailSourceSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = emailSourceSchema.safeParse({
        name: '',
        email: 'john@example.com',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = emailSourceSchema.safeParse({
        name: 'John Doe',
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('normalizes source email to lowercase', () => {
      const result = emailSourceSchema.safeParse({
        name: 'John Doe',
        email: 'JOHN@EXAMPLE.COM',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('john@example.com');
      }
    });
  });

  describe('emailMetadataSchema', () => {
    it('validates metadata with required wsId', () => {
      const result = emailMetadataSchema.safeParse({
        wsId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('validates metadata with all optional fields', () => {
      const result = emailMetadataSchema.safeParse({
        wsId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        templateType: 'welcome',
        entityType: 'user',
        entityId: '123e4567-e89b-12d3-a456-426614174002',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        priority: 'high',
        isInvite: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid wsId', () => {
      const result = emailMetadataSchema.safeParse({
        wsId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid priority', () => {
      const result = emailMetadataSchema.safeParse({
        wsId: '123e4567-e89b-12d3-a456-426614174000',
        priority: 'urgent',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid priority values', () => {
      const priorities = ['high', 'normal', 'low'];
      priorities.forEach((priority) => {
        const result = emailMetadataSchema.safeParse({
          wsId: '123e4567-e89b-12d3-a456-426614174000',
          priority,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('sendEmailParamsSchema', () => {
    it('validates complete email params', () => {
      const result = sendEmailParamsSchema.safeParse({
        recipients: {
          to: ['recipient@example.com'],
        },
        content: {
          subject: 'Test Subject',
          html: '<p>Hello</p>',
        },
        metadata: {
          wsId: '123e4567-e89b-12d3-a456-426614174000',
        },
      });
      expect(result.success).toBe(true);
    });

    it('validates email params with optional source', () => {
      const result = sendEmailParamsSchema.safeParse({
        recipients: {
          to: ['recipient@example.com'],
        },
        content: {
          subject: 'Test Subject',
          html: '<p>Hello</p>',
        },
        metadata: {
          wsId: '123e4567-e89b-12d3-a456-426614174000',
        },
        source: {
          name: 'Sender',
          email: 'sender@example.com',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('isValidEmail', () => {
    it('returns true for valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
    });

    it('returns false for invalid emails', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@no-local.com')).toBe(false);
    });
  });

  describe('normalizeEmail', () => {
    it('normalizes valid email to lowercase', () => {
      expect(normalizeEmail('TEST@EXAMPLE.COM')).toBe('test@example.com');
    });

    it('returns null for email with whitespace', () => {
      // Whitespace is not trimmed before validation
      expect(normalizeEmail('  test@example.com  ')).toBeNull();
    });

    it('returns null for invalid email', () => {
      expect(normalizeEmail('not-an-email')).toBeNull();
      expect(normalizeEmail('')).toBeNull();
    });
  });

  describe('normalizeEmailArray', () => {
    it('normalizes and deduplicates emails', () => {
      const result = normalizeEmailArray([
        'TEST@EXAMPLE.COM',
        'test@example.com',
        'other@domain.com',
      ]);
      expect(result).toHaveLength(2);
      expect(result).toContain('test@example.com');
      expect(result).toContain('other@domain.com');
    });

    it('filters out invalid emails', () => {
      const result = normalizeEmailArray([
        'valid@email.com',
        'invalid-email',
        'another@valid.com',
      ]);
      expect(result).toHaveLength(2);
      expect(result).toContain('valid@email.com');
      expect(result).toContain('another@valid.com');
    });

    it('returns empty array for all invalid emails', () => {
      const result = normalizeEmailArray(['invalid', 'also-invalid']);
      expect(result).toHaveLength(0);
    });
  });

  describe('validateEmailParams', () => {
    it('returns validated params for valid input', () => {
      const params = {
        recipients: { to: ['test@example.com'] },
        content: { subject: 'Test', html: '<p>Hello</p>' },
        metadata: { wsId: '123e4567-e89b-12d3-a456-426614174000' },
      };
      const result = validateEmailParams(params);
      expect(result.recipients.to).toContain('test@example.com');
    });

    it('throws ZodError for invalid input', () => {
      const params = {
        recipients: { to: [] },
        content: { subject: '', html: '' },
        metadata: { wsId: 'invalid' },
      };
      expect(() => validateEmailParams(params)).toThrow();
    });
  });

  describe('safeValidateEmailParams', () => {
    it('returns success result for valid input', () => {
      const params = {
        recipients: { to: ['test@example.com'] },
        content: { subject: 'Test', html: '<p>Hello</p>' },
        metadata: { wsId: '123e4567-e89b-12d3-a456-426614174000' },
      };
      const result = safeValidateEmailParams(params);
      expect(result.success).toBe(true);
    });

    it('returns error result for invalid input', () => {
      const params = {
        recipients: { to: [] },
        content: { subject: '', html: '' },
        metadata: { wsId: 'invalid' },
      };
      const result = safeValidateEmailParams(params);
      expect(result.success).toBe(false);
    });
  });

  describe('formatValidationErrors', () => {
    it('formats Zod errors into readable messages', () => {
      const result = sendEmailParamsSchema.safeParse({
        recipients: { to: [] },
        content: { subject: '', html: '' },
        metadata: { wsId: 'invalid' },
      });

      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        expect(Array.isArray(errors)).toBe(true);
        expect(errors.length).toBeGreaterThan(0);
        errors.forEach((error) => {
          expect(typeof error).toBe('string');
        });
      }
    });
  });
});
