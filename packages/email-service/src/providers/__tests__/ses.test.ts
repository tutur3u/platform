import { GetSendQuotaCommand, SendEmailCommand } from '@aws-sdk/client-ses';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESEmailProvider } from '../ses';

// Mock AWS SDK
vi.mock('@aws-sdk/client-ses', () => {
  return {
    SESClient: class {
      send = vi.fn();
    },
    SendEmailCommand: vi.fn(),
    GetSendQuotaCommand: vi.fn(),
  };
});

describe('SESEmailProvider', () => {
  const mockCredentials = {
    type: 'ses' as const,
    region: 'us-east-1',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  };

  let provider: SESEmailProvider;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new SESEmailProvider(mockCredentials);
    // Access the private client's send mock
    mockSend = (provider as any).client.send;
  });

  describe('send', () => {
    const defaultParams = {
      source: 'sender@example.com',
      recipients: {
        to: ['recipient@example.com'],
      },
      content: {
        subject: 'Test Subject',
        html: '<p>Test Body</p>',
      },
    };

    it('should successfully send an email', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'msg-id-123',
        $metadata: { httpStatusCode: 200 },
      });

      const result = await provider.send(defaultParams);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-id-123');
      expect(SendEmailCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Source: defaultParams.source,
          Destination: {
            ToAddresses: defaultParams.recipients.to,
          },
          Message: expect.objectContaining({
            Subject: { Data: defaultParams.content.subject, Charset: 'UTF-8' },
          }),
        })
      );
    });

    it('should handle SES specific errors', async () => {
      const error = new Error('Message rejected');
      error.name = 'MessageRejected';
      mockSend.mockRejectedValueOnce(error);

      const result = await provider.send(defaultParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email rejected');
    });

    it('should handle unverified domain errors', async () => {
      const error = new Error('Domain not verified');
      error.name = 'MailFromDomainNotVerifiedException';
      mockSend.mockRejectedValueOnce(error);

      const result = await provider.send(defaultParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sender domain not verified');
    });

    it('should handle unknown errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Unknown error'));

      const result = await provider.send(defaultParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should handle CC and BCC recipients', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'msg-id-123',
        $metadata: { httpStatusCode: 200 },
      });

      await provider.send({
        ...defaultParams,
        recipients: {
          to: ['to@example.com'],
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
        },
      });

      expect(SendEmailCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Destination: {
            ToAddresses: ['to@example.com'],
            CcAddresses: ['cc@example.com'],
            BccAddresses: ['bcc@example.com'],
          },
        })
      );
    });
  });

  describe('validateCredentials', () => {
    it('should return true for valid credentials', async () => {
      mockSend.mockResolvedValueOnce({
        Max24HourSend: 200,
        MaxSendRate: 10,
        SentLast24Hours: 5,
        $metadata: { httpStatusCode: 200 },
      });

      const isValid = await provider.validateCredentials();

      expect(isValid).toBe(true);
      expect(GetSendQuotaCommand).toHaveBeenCalled();
    });

    it('should return false when API call fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Invalid credentials'));

      const isValid = await provider.validateCredentials();

      expect(isValid).toBe(false);
    });

    it('should return false for invalid response status', async () => {
      mockSend.mockResolvedValueOnce({
        $metadata: { httpStatusCode: 403 },
      });

      const isValid = await provider.validateCredentials();

      expect(isValid).toBe(false);
    });
  });

  describe('getSendQuota', () => {
    it('should return quota info on success', async () => {
      mockSend.mockResolvedValueOnce({
        Max24HourSend: 200,
        MaxSendRate: 10,
        SentLast24Hours: 5,
      });

      const quota = await provider.getSendQuota();

      expect(quota).toEqual({
        max24HourSend: 200,
        maxSendRate: 10,
        sentLast24Hours: 5,
      });
    });

    it('should return null on error', async () => {
      mockSend.mockRejectedValueOnce(new Error('Quota error'));

      const quota = await provider.getSendQuota();

      expect(quota).toBeNull();
    });
  });
});
