import { createServerFn } from '@tanstack/react-start';
import type {
  SendOtpInput,
  VerifyOtpInput,
} from '../app/[locale]/login/actions';
import { novaActionContracts } from './action-contracts';

const addWhitelistEmailTransport = createServerFn({ method: 'POST' })
  .validator(novaActionContracts.addWhitelistEmail)
  .handler(async ({ data }) => {
    const actions = await import('./actions.server');
    return actions.addWhitelistEmail(...data);
  });

export function addWhitelistEmail(email: string, enabled: boolean) {
  return addWhitelistEmailTransport({ data: [email, enabled] });
}

const fetchAdminsTransport = createServerFn({ method: 'GET' })
  .validator(novaActionContracts.fetchAdmins)
  .handler(async () => {
    const actions = await import('./actions.server');
    return actions.fetchAdmins();
  });

export function fetchAdmins() {
  return fetchAdminsTransport({ data: [] });
}

const fetchAllProblemsTransport = createServerFn({ method: 'GET' })
  .validator(novaActionContracts.fetchAllProblems)
  .handler(async ({ data }) => {
    const actions = await import('./actions.server');
    return actions.fetchAllProblems(...data);
  });

export function fetchAllProblems(challengeId: string, userId: string) {
  return fetchAllProblemsTransport({ data: [challengeId, userId] });
}

const fetchSessionDetailsTransport = createServerFn({ method: 'GET' })
  .validator(novaActionContracts.fetchSessionDetails)
  .handler(async ({ data }) => {
    const actions = await import('./actions.server');
    return actions.fetchSessionDetails(...data);
  });

export function fetchSessionDetails(sessionId: string, challengeId: string) {
  return fetchSessionDetailsTransport({ data: [sessionId, challengeId] });
}

const getFullSubmissionTransport = createServerFn({ method: 'GET' })
  .validator(novaActionContracts.getFullSubmission)
  .handler(async ({ data }) => {
    const actions = await import('./actions.server');
    return actions.getFullSubmission(...data);
  });

export function getFullSubmission(
  submissionId: string,
  includeHiddenTestCases = false
) {
  return getFullSubmissionTransport({
    data: [submissionId, includeHiddenTestCases],
  });
}

const sendOtpTransport = createServerFn({ method: 'POST' })
  .validator(novaActionContracts.sendOtpAction)
  .handler(async ({ data }) => {
    const actions = await import('./actions.server');
    return actions.sendOtpAction(...data);
  });

export function sendOtpAction(input: SendOtpInput) {
  return sendOtpTransport({ data: [input] });
}

const verifyOtpTransport = createServerFn({ method: 'POST' })
  .validator(novaActionContracts.verifyOtpAction)
  .handler(async ({ data }) => {
    const actions = await import('./actions.server');
    return actions.verifyOtpAction(...data);
  });

export function verifyOtpAction(input: VerifyOtpInput) {
  return verifyOtpTransport({ data: [input] });
}
