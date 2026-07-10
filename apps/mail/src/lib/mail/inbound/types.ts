export type AnyRecord = Record<string, any>;

export type SnsEnvelope = {
  Message: string;
  MessageId: string;
  Signature: string;
  SignatureVersion: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Timestamp: string;
  Token?: string;
  TopicArn: string;
  Type: 'Notification' | 'SubscriptionConfirmation' | string;
};

export type SesNotification = {
  mail?: {
    commonHeaders?: {
      cc?: string[];
      date?: string;
      from?: string[];
      messageId?: string;
      subject?: string;
      to?: string[];
    };
    destination?: string[];
    messageId?: string;
    source?: string;
    timestamp?: string;
  };
  receipt?: {
    action?: {
      bucketName?: string;
      objectKey?: string;
      topicArn?: string;
      type?: string;
    };
    dkimVerdict?: { status?: string };
    dmarcVerdict?: { status?: string };
    recipients?: string[];
    spamVerdict?: { status?: string };
    spfVerdict?: { status?: string };
    virusVerdict?: { status?: string };
  };
};

export type ParsedEmailAddress = {
  address: string;
  displayName: string | null;
};

export type ParsedEmailAttachment = {
  contentId: string | null;
  contentType: string;
  disposition: 'attachment' | 'inline';
  filename: string;
  sizeBytes: number;
  storedObjectId?: string | null;
};

export type ParsedEmail = {
  attachments: ParsedEmailAttachment[];
  bodyHtml: string | null;
  bodyText: string | null;
  cc: ParsedEmailAddress[];
  from: ParsedEmailAddress | null;
  headers: Record<string, string>;
  inReplyTo: string | null;
  internetMessageId: string | null;
  references: string[];
  subject: string;
  to: ParsedEmailAddress[];
};
