import 'server-only';

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

function resolveFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson) as {
      client_email: string;
      private_key: string;
      project_id: string;
    };

    return initializeApp({
      credential: cert({
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replaceAll('\\n', '\n'),
        projectId: parsed.project_id,
      }),
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        clientEmail,
        privateKey: privateKey.replaceAll('\\n', '\n'),
        projectId,
      }),
    });
  }

  return initializeApp({
    credential: applicationDefault(),
  });
}

let messagingSingleton: Messaging | null = null;

export function getFirebaseMessagingClient(): Messaging {
  if (messagingSingleton) {
    return messagingSingleton;
  }

  messagingSingleton = getMessaging(resolveFirebaseApp());
  return messagingSingleton;
}
