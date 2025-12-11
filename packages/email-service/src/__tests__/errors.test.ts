import { describe, expect, it } from 'vitest';

import {
  AllRecipientsBlockedError,
  BlacklistedEmailError,
  CredentialsError,
  EmailError,
  EmailValidationError,
  getUserFriendlyMessage,
  InvalidEmailError,
  isEmailError,
  isRetryable,
  NetworkError,
  NotInitializedError,
  ProviderError,
  RateLimitError,
  SESError,
  TimeoutError,
  wrapError,
} from '../errors';

import type { BlockedRecipient, RateLimitInfo } from '../types';

describe('Email Errors', () => {
  describe('EmailError', () => {
    it('creates error with required properties', () => {
      const error = new EmailError('Test error', {
        code: 'TEST_ERROR',
      });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('EmailError');
    });

    it('creates error with custom properties', () => {
      const cause = new Error('Underlying error');
      const error = new EmailError('Test error', {
        code: 'TEST_ERROR',
        retryable: true,
        statusCode: 400,
        cause,
      });

      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(400);
      expect(error.cause).toBe(cause);
    });

    it('converts to JSON', () => {
      const error = new EmailError('Test error', {
        code: 'TEST_ERROR',
        retryable: true,
        statusCode: 400,
      });

      const json = error.toJSON();

      expect(json).toEqual({
        name: 'EmailError',
        code: 'TEST_ERROR',
        message: 'Test error',
        retryable: true,
        statusCode: 400,
      });
    });
  });

  describe('EmailValidationError', () => {
    it('creates error with validation errors', () => {
      const validationErrors = ['Invalid email', 'Subject too long'];
      const error = new EmailValidationError(validationErrors);

      expect(error.message).toBe(
        'Email validation failed: Invalid email; Subject too long'
      );
      expect(error.code).toBe('EMAIL_VALIDATION_FAILED');
      expect(error.validationErrors).toEqual(validationErrors);
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('EmailValidationError');
    });

    it('converts to JSON with validation errors', () => {
      const error = new EmailValidationError(['Invalid email']);
      const json = error.toJSON();

      expect(json.validationErrors).toEqual(['Invalid email']);
    });
  });

  describe('InvalidEmailError', () => {
    it('creates error with email address', () => {
      const error = new InvalidEmailError('not-an-email');

      expect(error.message).toBe('Invalid email address: not-an-email');
      expect(error.code).toBe('INVALID_EMAIL_ADDRESS');
      expect(error.email).toBe('not-an-email');
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('InvalidEmailError');
    });
  });

  describe('RateLimitError', () => {
    it('creates error with rate limit info', () => {
      const rateLimitInfo: RateLimitInfo = {
        allowed: false,
        remaining: 0,
        reason: 'Workspace limit exceeded',
        retryAfter: 60,
        limitType: 'workspace_minute',
      };
      const error = new RateLimitError(rateLimitInfo);

      expect(error.message).toBe('Workspace limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.rateLimitInfo).toEqual(rateLimitInfo);
      expect(error.retryAfterSeconds).toBe(60);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(429);
      expect(error.name).toBe('RateLimitError');
    });

    it('uses default message when reason not provided', () => {
      const rateLimitInfo: RateLimitInfo = {
        allowed: false,
        remaining: 0,
        limitType: 'user_minute',
      };
      const error = new RateLimitError(rateLimitInfo);

      expect(error.message).toBe('Rate limit exceeded');
    });

    it('converts to JSON with rate limit info', () => {
      const rateLimitInfo: RateLimitInfo = {
        allowed: false,
        remaining: 0,
        retryAfter: 30,
        limitType: 'workspace_hour',
      };
      const error = new RateLimitError(rateLimitInfo);
      const json = error.toJSON();

      expect(json.rateLimitInfo).toEqual(rateLimitInfo);
      expect(json.retryAfterSeconds).toBe(30);
    });
  });

  describe('AllRecipientsBlockedError', () => {
    it('creates error with blocked recipients', () => {
      const blockedRecipients: BlockedRecipient[] = [
        { email: 'blocked@example.com', reason: 'blacklist' },
        { email: 'spam@example.com', reason: 'complaint' },
      ];
      const error = new AllRecipientsBlockedError(blockedRecipients);

      expect(error.message).toContain('blocked@example.com');
      expect(error.message).toContain('blacklist');
      expect(error.code).toBe('ALL_RECIPIENTS_BLOCKED');
      expect(error.blockedRecipients).toEqual(blockedRecipients);
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('AllRecipientsBlockedError');
    });

    it('converts to JSON with blocked recipients', () => {
      const blockedRecipients: BlockedRecipient[] = [
        { email: 'test@example.com', reason: 'blacklist' },
      ];
      const error = new AllRecipientsBlockedError(blockedRecipients);
      const json = error.toJSON();

      expect(json.blockedRecipients).toEqual(blockedRecipients);
    });
  });

  describe('BlacklistedEmailError', () => {
    it('creates error with email', () => {
      const error = new BlacklistedEmailError('spam@example.com');

      expect(error.message).toBe(
        'Email address is blacklisted: spam@example.com'
      );
      expect(error.code).toBe('EMAIL_BLACKLISTED');
      expect(error.email).toBe('spam@example.com');
      expect(error.reason).toBeUndefined();
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('BlacklistedEmailError');
    });

    it('creates error with email and reason', () => {
      const error = new BlacklistedEmailError(
        'spam@example.com',
        'Hard bounce'
      );

      expect(error.message).toBe(
        'Email address is blacklisted: spam@example.com (Hard bounce)'
      );
      expect(error.reason).toBe('Hard bounce');
    });
  });

  describe('ProviderError', () => {
    it('creates error with provider name', () => {
      const error = new ProviderError('SendGrid', 'Connection failed');

      expect(error.message).toBe('SendGrid error: Connection failed');
      expect(error.code).toBe('PROVIDER_ERROR');
      expect(error.provider).toBe('SendGrid');
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(502);
      expect(error.name).toBe('ProviderError');
    });

    it('creates error with options', () => {
      const cause = new Error('Network error');
      const error = new ProviderError('SendGrid', 'API failed', {
        providerCode: 'SG_001',
        retryable: true,
        cause,
      });

      expect(error.providerCode).toBe('SG_001');
      expect(error.retryable).toBe(true);
      expect(error.cause).toBe(cause);
    });

    it('converts to JSON with provider info', () => {
      const error = new ProviderError('SendGrid', 'Failed', {
        providerCode: 'SG_001',
      });
      const json = error.toJSON();

      expect(json.provider).toBe('SendGrid');
      expect(json.providerCode).toBe('SG_001');
    });
  });

  describe('SESError', () => {
    it('creates SES-specific error', () => {
      const error = new SESError('Invalid credentials');

      expect(error.message).toBe('SES error: Invalid credentials');
      expect(error.provider).toBe('SES');
      expect(error.name).toBe('SESError');
    });

    it('creates error with options', () => {
      const error = new SESError('Throttling', {
        providerCode: 'ThrottlingException',
        retryable: true,
      });

      expect(error.providerCode).toBe('ThrottlingException');
      expect(error.retryable).toBe(true);
    });
  });

  describe('CredentialsError', () => {
    it('creates error without workspace', () => {
      const error = new CredentialsError('Missing API key');

      expect(error.message).toBe('Missing API key');
      expect(error.code).toBe('CREDENTIALS_ERROR');
      expect(error.wsId).toBeUndefined();
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('CredentialsError');
    });

    it('creates error with workspace', () => {
      const error = new CredentialsError('Invalid SES config', 'ws-123');

      expect(error.wsId).toBe('ws-123');
    });
  });

  describe('NotInitializedError', () => {
    it('creates error with default message', () => {
      const error = new NotInitializedError();

      expect(error.message).toBe('Email service not initialized');
      expect(error.code).toBe('NOT_INITIALIZED');
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('NotInitializedError');
    });

    it('creates error with custom message', () => {
      const error = new NotInitializedError('Provider not configured');

      expect(error.message).toBe('Provider not configured');
    });
  });

  describe('NetworkError', () => {
    it('creates error with message', () => {
      const error = new NetworkError('Connection refused');

      expect(error.message).toBe('Connection refused');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(503);
      expect(error.name).toBe('NetworkError');
    });

    it('creates error with cause', () => {
      const cause = new Error('ECONNREFUSED');
      const error = new NetworkError('Connection failed', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('TimeoutError', () => {
    it('creates error with timeout', () => {
      const error = new TimeoutError(5000);

      expect(error.message).toBe('Operation timed out after 5000ms');
      expect(error.code).toBe('TIMEOUT');
      expect(error.timeoutMs).toBe(5000);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(504);
      expect(error.name).toBe('TimeoutError');
    });

    it('creates error with operation name', () => {
      const error = new TimeoutError(3000, 'Email send');

      expect(error.message).toBe('Email send timed out after 3000ms');
    });
  });

  describe('isEmailError()', () => {
    it('returns true for EmailError instances', () => {
      expect(isEmailError(new EmailError('Test', { code: 'TEST' }))).toBe(true);
      expect(isEmailError(new EmailValidationError(['error']))).toBe(true);
      expect(
        isEmailError(
          new RateLimitError({
            allowed: false,
            remaining: 0,
            limitType: 'user_minute',
          })
        )
      ).toBe(true);
      expect(isEmailError(new NetworkError('Test'))).toBe(true);
    });

    it('returns false for non-EmailError', () => {
      expect(isEmailError(new Error('Test'))).toBe(false);
      expect(isEmailError('error')).toBe(false);
      expect(isEmailError(null)).toBe(false);
      expect(isEmailError(undefined)).toBe(false);
      expect(isEmailError({})).toBe(false);
    });
  });

  describe('isRetryable()', () => {
    it('returns true for retryable EmailErrors', () => {
      expect(
        isRetryable(
          new RateLimitError({
            allowed: false,
            remaining: 0,
            limitType: 'user_minute',
          })
        )
      ).toBe(true);
      expect(isRetryable(new NetworkError('Test'))).toBe(true);
      expect(isRetryable(new TimeoutError(1000))).toBe(true);
    });

    it('returns false for non-retryable EmailErrors', () => {
      expect(isRetryable(new EmailValidationError(['error']))).toBe(false);
      expect(isRetryable(new InvalidEmailError('test'))).toBe(false);
      expect(isRetryable(new BlacklistedEmailError('test@example.com'))).toBe(
        false
      );
    });

    it('returns true for network-related Error messages', () => {
      expect(isRetryable(new Error('Network error'))).toBe(true);
      expect(isRetryable(new Error('Request timeout'))).toBe(true);
      expect(isRetryable(new Error('ECONNREFUSED'))).toBe(true);
      expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
    });

    it('returns false for non-network Errors', () => {
      expect(isRetryable(new Error('Invalid input'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isRetryable('error')).toBe(false);
      expect(isRetryable(null)).toBe(false);
    });
  });

  describe('getUserFriendlyMessage()', () => {
    it('returns friendly message for EmailValidationError', () => {
      const error = new EmailValidationError(['error']);
      expect(getUserFriendlyMessage(error)).toBe(
        'Please check the email addresses and try again.'
      );
    });

    it('returns friendly message for RateLimitError', () => {
      const error = new RateLimitError({
        allowed: false,
        remaining: 0,
        retryAfter: 30,
        limitType: 'user_minute',
      });
      expect(getUserFriendlyMessage(error)).toBe(
        'Too many emails sent. Please wait 30 seconds and try again.'
      );
    });

    it('returns friendly message for AllRecipientsBlockedError', () => {
      const error = new AllRecipientsBlockedError([
        { email: 'test@example.com', reason: 'blacklist' },
      ]);
      expect(getUserFriendlyMessage(error)).toBe(
        'The email address(es) cannot receive emails at this time.'
      );
    });

    it('returns friendly message for BlacklistedEmailError', () => {
      const error = new BlacklistedEmailError('test@example.com');
      expect(getUserFriendlyMessage(error)).toBe(
        'This email address has been blocked from receiving emails.'
      );
    });

    it('returns friendly message for ProviderError', () => {
      const error = new ProviderError('SES', 'Failed');
      expect(getUserFriendlyMessage(error)).toBe(
        'There was a problem sending the email. Please try again later.'
      );
    });

    it('returns friendly message for CredentialsError', () => {
      const error = new CredentialsError('Invalid');
      expect(getUserFriendlyMessage(error)).toBe(
        'Email service is not configured properly. Please contact support.'
      );
    });

    it('returns friendly message for NetworkError', () => {
      const error = new NetworkError('Failed');
      expect(getUserFriendlyMessage(error)).toBe(
        'Network error. Please check your connection and try again.'
      );
    });

    it('returns generic message for regular Error', () => {
      const error = new Error('Something went wrong');
      expect(getUserFriendlyMessage(error)).toBe(
        'An unexpected error occurred while sending the email.'
      );
    });

    it('returns generic message for non-Error', () => {
      expect(getUserFriendlyMessage('error')).toBe(
        'An unknown error occurred.'
      );
    });
  });

  describe('wrapError()', () => {
    it('returns EmailError as-is', () => {
      const original = new EmailValidationError(['error']);
      const wrapped = wrapError(original);
      expect(wrapped).toBe(original);
    });

    it('wraps Error in EmailError', () => {
      const original = new Error('Something failed');
      const wrapped = wrapError(original);

      expect(wrapped).toBeInstanceOf(EmailError);
      expect(wrapped.message).toBe('Something failed');
      expect(wrapped.code).toBe('UNKNOWN_ERROR');
      expect(wrapped.cause).toBe(original);
    });

    it('wraps non-Error values', () => {
      const wrapped = wrapError('string error');

      expect(wrapped).toBeInstanceOf(EmailError);
      expect(wrapped.message).toBe('string error');
      expect(wrapped.code).toBe('UNKNOWN_ERROR');
    });

    it('adds context to message', () => {
      const original = new Error('Failed');
      const wrapped = wrapError(original, 'During email send');

      expect(wrapped.message).toBe('During email send: Failed');
    });

    it('marks network errors as retryable', () => {
      const original = new Error('Network timeout');
      const wrapped = wrapError(original);

      expect(wrapped.retryable).toBe(true);
    });
  });
});
