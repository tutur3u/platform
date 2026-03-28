import 'server-only';

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

export interface FirebaseMessagingConfigurationStatus {
  source:
    | 'application_default'
    | 'service_account_env'
    | 'service_account_json';
  state: 'application-default' | 'configured' | 'invalid' | 'partial';
  message: string;
  projectId: string | null;
}

export function getFirebaseMessagingConfigurationStatus(): FirebaseMessagingConfigurationStatus {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson) as {
        client_email?: string;
        private_key?: string;
        project_id?: string;
      };

      const hasAllFields = Boolean(
        parsed.client_email && parsed.private_key && parsed.project_id
      );

      return {
        source: 'service_account_json',
        state: hasAllFields ? 'configured' : 'partial',
        message: hasAllFields
          ? 'Firebase Admin is configured from FIREBASE_SERVICE_ACCOUNT_JSON.'
          : 'FIREBASE_SERVICE_ACCOUNT_JSON is present but missing one or more required service-account fields.',
        projectId: parsed.project_id ?? null,
      };
    } catch {
      return {
        source: 'service_account_json',
        state: 'invalid',
        message:
          'FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed as valid JSON.',
        projectId: null,
      };
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const populatedFields = [projectId, clientEmail, privateKey].filter(
    Boolean
  ).length;

  if (populatedFields > 0) {
    return {
      source: 'service_account_env',
      state: populatedFields === 3 ? 'configured' : 'partial',
      message:
        populatedFields === 3
          ? 'Firebase Admin is configured from split FIREBASE_* service-account environment variables.'
          : 'Firebase Admin split service-account environment variables are only partially configured.',
      projectId: projectId ?? null,
    };
  }

  return {
    source: 'application_default',
    state: 'application-default',
    message:
      'No explicit Firebase Admin service-account environment variables were found. Runtime Application Default Credentials will be used if available.',
    projectId: null,
  };
}

function resolveFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const { source } = getFirebaseMessagingConfigurationStatus();
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

  if (
    source === 'service_account_env' &&
    projectId &&
    clientEmail &&
    privateKey
  ) {
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
