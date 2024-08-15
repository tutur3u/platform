import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import juice from 'juice';
import { useState } from 'react';
import ReactDOMServer from 'react-dom/server';

interface SendEmailParams {
  recipients: string[];
  subject: string;
  component: React.ReactElement; // Accept a React component
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
    recipients,
    subject,
    component,
  }: SendEmailParams): Promise<void> => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Render the React component to an HTML string
      const htmlContent = ReactDOMServer.renderToString(component);

      // Optionally, inline CSS using Juice
      const inlinedHtmlContent = juice(htmlContent);

      const params = {
        Source: `${process.env.NEXT_PUBLIC_SOURCE_NAME} <${process.env.NEXT_PUBLIC_SOURCE_EMAIL}>`,
        Destination: {
          ToAddresses: recipients,
        },
        Message: {
          Subject: { Data: subject },
          Body: {
            Html: { Data: inlinedHtmlContent },
          },
        },
      };

      const command = new SendEmailCommand(params);
      await sesClient.send(command);

      setSuccess(true);
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
