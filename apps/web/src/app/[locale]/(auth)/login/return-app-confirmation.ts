const MANAGED_TUTURUUU_RETURN_APP = 'managed-tuturuuu';

export function requiresAccountConfirmationForReturnApp(
  returnApp: string | null,
  isRegisteredInternalAppReturn: boolean,
  explicitlyRequested = false
) {
  return Boolean(
    returnApp &&
    !['platform', 'web', MANAGED_TUTURUUU_RETURN_APP].includes(returnApp) &&
    (explicitlyRequested || !isRegisteredInternalAppReturn)
  );
}
