import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandOutput,
} from '@aws-sdk/client-ses';
import { useState } from 'react';

interface SendEmailParams {
  to: string;
  subject: string;
  message: string;
}

const sesClient = new SESClient({
  region: process.env.NEXT_PUBLIC_AWS_REGION as string, 
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY as string,
  },
});

const useEmail = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sendEmail = async ({
    to,
    subject,
    message,
  }: SendEmailParams): Promise<SendEmailCommandOutput> => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const params = {
        Source: process.env.NEXT_PUBLIC_SOURCE_EMAIL,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: message },
          },
        },
      };

      const command = new SendEmailCommand(params);
      const response = await sesClient.send(command);

      setSuccess(true);
      return response;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { sendEmail, loading, error, success };
};

export default useEmail;
