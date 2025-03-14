import { calendar_v3 } from '@googleapis/calendar';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { NextApiRequest, NextApiResponse } from 'next';

const getGoogleAuthClient = (tokens: {
  access_token: string;
  refresh_token?: string;
}) => {
  const oauth2Client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

const getGoogleColorId = (color: string): string => {
  const colorMap: Record<string, string> = {
    BLUE: '11',
    RED: '1',
    GREEN: '2',
    YELLOW: '5',
    ORANGE: '6',
    PURPLE: '9',
    PINK: '4',
    INDIGO: '10',
    CYAN: '8',
    GRAY: '3',
  };
  return color && colorMap[color] ? colorMap[color] : '11';
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event, googleTokens } = req.body;

  if (!googleTokens?.access_token) {
    return res.status(401).json({ error: 'Google Calendar not authenticated' });
  }

  try {
    const auth = getGoogleAuthClient(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth });

    const googleEvent: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      start: {
        dateTime: event.start_at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: event.end_at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      colorId: getGoogleColorId(event.color),
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: googleEvent,
    });

    res.status(200).json({ googleEventId: response.data.id });
  } catch (error) {
    console.error('Failed to sync with Google Calendar:', error);
    res.status(500).json({ error: 'Failed to sync event' });
  }
}
