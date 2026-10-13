import assert from 'node:assert/strict';
import type {
  PasskeyAuthenticationVerifyParams,
  PasskeyRegistrationVerifyParams,
} from '@supabase/auth-js';
import {
  serializeCredentialRequestResponse as serializeCommonJSAuthentication,
  serializeCredentialCreationResponse as serializeCommonJSRegistration,
} from '@supabase/auth-js/dist/main/lib/webauthn';
import type { PublicKeyCredentialFuture as CommonJSFuture } from '@supabase/auth-js/dist/main/lib/webauthn.dom';
import {
  deserializeCredentialCreationOptions,
  deserializeCredentialRequestOptions,
  serializeCredentialCreationResponse,
  serializeCredentialRequestResponse,
} from '@supabase/auth-js/dist/module/lib/webauthn';
import type {
  AuthenticationCredential,
  AuthenticationResponseJSON,
  PublicKeyCredentialFuture,
  RegistrationCredential,
  RegistrationResponseJSON,
} from '@supabase/auth-js/dist/module/lib/webauthn.dom';

function checkPublicContracts(
  registration: PublicKeyCredentialFuture<RegistrationResponseJSON>,
  authentication: PublicKeyCredentialFuture<AuthenticationResponseJSON>,
  commonJS: CommonJSFuture<AuthenticationResponseJSON>
) {
  type IsAny<T> = 0 extends 1 & T ? true : false;
  const serializerIsAny: IsAny<ReturnType<typeof authentication.toJSON>> =
    false;
  const extensionsAreAny: IsAny<
    AuthenticationResponseJSON['clientExtensionResults']
  > = false;
  const moduleToCommonJS: CommonJSFuture<AuthenticationResponseJSON> =
    authentication;
  const commonJSToModule: PublicKeyCredentialFuture<AuthenticationResponseJSON> =
    commonJS;
  void [serializerIsAny, extensionsAreAny, moduleToCommonJS, commonJSToModule];

  // Every native instance member except the separately declared serializer survives.
  const nativeMembers: Omit<PublicKeyCredential, 'toJSON'> = authentication;
  const id: string = nativeMembers.id;
  const rawId: ArrayBuffer = nativeMembers.rawId;
  const response: AuthenticatorResponse = nativeMembers.response;
  const extensions: AuthenticationExtensionsClientOutputs =
    nativeMembers.getClientExtensionResults();
  const registrationRequest: PasskeyRegistrationVerifyParams = {
    challenge_id: 'registration',
    credential: registration.toJSON(),
  };
  const authenticationRequest: PasskeyAuthenticationVerifyParams = {
    challenge_id: 'authentication',
    credential: authentication.toJSON(),
  };
  const commonJSRequest: PasskeyAuthenticationVerifyParams = {
    challenge_id: 'commonjs',
    credential: commonJS.toJSON(),
  };

  // The package's existing extension output is a raw buffer, not native JSON.
  const blob: ArrayBuffer | undefined =
    authenticationRequest.credential.clientExtensionResults.largeBlob?.blob;
  // @ts-expect-error Raw extension output cannot be advertised as base64url JSON.
  const encodedBlob: string | undefined = blob;
  // @ts-expect-error A different serializer return is not a native credential subtype.
  const nativeCredential: PublicKeyCredential = authentication;
  // @ts-expect-error Registration and authentication responses remain distinct.
  const wrongResponse: PasskeyRegistrationVerifyParams = authenticationRequest;
  // @ts-expect-error Public verification still requires its challenge identity.
  const missingChallenge: PasskeyAuthenticationVerifyParams = {
    credential: authentication.toJSON(),
  };

  void [
    id,
    rawId,
    response,
    extensions,
    registrationRequest,
    authenticationRequest,
    commonJSRequest,
    encodedBlob,
    nativeCredential,
    wrongResponse,
    missingChallenge,
  ];
}
void checkPublicContracts;

const binary = new Uint8Array([0, 255, 16]).buffer;
const extensions: AuthenticationExtensionsClientOutputs = {
  largeBlob: { blob: binary, supported: true },
  prf: { results: { first: binary, second: binary } },
};
const nativeExtensions: AuthenticationExtensionsClientOutputsJSON = {
  largeBlob: { blob: 'AP8Q', supported: true },
  prf: { results: { first: 'AP8Q', second: 'AP8Q' } },
};
const authenticationJSON: AuthenticationResponseJSON = {
  id: 'credential',
  rawId: 'credential',
  type: 'public-key',
  response: {
    authenticatorData: 'AP8Q',
    clientDataJSON: 'AP8Q',
    signature: 'AP8Q',
    userHandle: 'AP8Q',
  },
  authenticatorAttachment: 'platform',
  clientExtensionResults: extensions,
};
const registrationJSON: RegistrationResponseJSON = {
  id: 'credential',
  rawId: 'credential',
  type: 'public-key',
  response: { attestationObject: 'AP8Q', clientDataJSON: 'AP8Q' },
  authenticatorAttachment: 'platform',
  clientExtensionResults: extensions,
};
const nativeAuthenticationJSON: globalThis.AuthenticationResponseJSON = {
  ...authenticationJSON,
  clientExtensionResults: nativeExtensions,
};
const nativeRegistrationJSON: globalThis.RegistrationResponseJSON = {
  ...registrationJSON,
  response: {
    attestationObject: 'AP8Q',
    authenticatorData: 'AP8Q',
    clientDataJSON: 'AP8Q',
    publicKeyAlgorithm: -7,
    transports: ['internal'],
  },
  clientExtensionResults: nativeExtensions,
};
let extensionCalls = 0;
let serializerCalls = 0;
const commonMembers = {
  id: 'credential',
  rawId: binary,
  type: 'public-key',
  authenticatorAttachment: 'platform',
  getClientExtensionResults() {
    extensionCalls += 1;
    return extensions;
  },
  parseCreationOptionsFromJSON: deserializeCredentialCreationOptions,
  parseRequestOptionsFromJSON: deserializeCredentialRequestOptions,
} satisfies Omit<PublicKeyCredentialFuture, 'response' | 'toJSON'>;
const authentication: AuthenticationCredential = {
  ...commonMembers,
  response: {
    authenticatorData: binary,
    clientDataJSON: binary,
    signature: binary,
    userHandle: binary,
  },
  toJSON() {
    serializerCalls += 1;
    return authenticationJSON;
  },
};
const registration: RegistrationCredential = {
  ...commonMembers,
  response: {
    attestationObject: binary,
    clientDataJSON: binary,
    getAuthenticatorData: () => binary,
    getPublicKey: () => null,
    getPublicKeyAlgorithm: () => -7,
    getTransports: () => ['internal'],
  },
  toJSON() {
    serializerCalls += 1;
    return registrationJSON;
  },
};
const nativeAuthentication = {
  ...authentication,
  toJSON() {
    serializerCalls += 1;
    return nativeAuthenticationJSON;
  },
} satisfies PublicKeyCredential;
const nativeRegistration = {
  ...registration,
  toJSON() {
    serializerCalls += 1;
    return nativeRegistrationJSON;
  },
} satisfies PublicKeyCredential;

// Both formats preserve the package serializer result without conversion.
for (const serialize of [
  serializeCredentialRequestResponse,
  serializeCommonJSAuthentication,
]) {
  assert.equal(serialize(authentication), authenticationJSON);
  // @ts-expect-error Native JSON has encoded extensions, unlike the package contract.
  assert.equal(serialize(nativeAuthentication), nativeAuthenticationJSON);
}
for (const serialize of [
  serializeCredentialCreationResponse,
  serializeCommonJSRegistration,
]) {
  assert.equal(serialize(registration), registrationJSON);
  // @ts-expect-error Native JSON has encoded extensions, unlike the package contract.
  assert.equal(serialize(nativeRegistration), nativeRegistrationJSON);
}
assert.equal(serializerCalls, 8);
assert.equal(extensionCalls, 0);
assert.equal(
  nativeAuthentication.toJSON().clientExtensionResults.largeBlob?.blob,
  'AP8Q'
);
assert.equal(
  authentication.toJSON().clientExtensionResults.largeBlob?.blob,
  binary
);

// Removing only toJSON exercises the real fallback. Its required method is a
// retained signature limitation, so the rejection is explicit rather than cast away.
const { toJSON: authenticationSerializer, ...fallbackAuthentication } =
  authentication;
const { toJSON: registrationSerializer, ...fallbackRegistration } =
  registration;
void [authenticationSerializer, registrationSerializer];
const callsBeforeFallback = serializerCalls;
for (const serialize of [
  serializeCredentialRequestResponse,
  serializeCommonJSAuthentication,
]) {
  // @ts-expect-error The existing signature requires toJSON even for fallback inputs.
  const actual = serialize(fallbackAuthentication);
  assert.deepEqual(actual, authenticationJSON);
  assert.equal(actual.clientExtensionResults, extensions);
  assert.equal(actual.clientExtensionResults.largeBlob?.blob, binary);
  assert.equal(actual.clientExtensionResults.prf?.results?.first, binary);
  assert.equal(
    JSON.stringify(actual.clientExtensionResults.largeBlob?.blob),
    '{}'
  );
}
for (const serialize of [
  serializeCredentialCreationResponse,
  serializeCommonJSRegistration,
]) {
  // @ts-expect-error The existing signature requires toJSON even for fallback inputs.
  const actual = serialize(fallbackRegistration);
  assert.deepEqual(actual, registrationJSON);
  assert.equal(actual.clientExtensionResults, extensions);
  assert.equal(actual.clientExtensionResults.largeBlob?.blob, binary);
}
assert.equal(serializerCalls, callsBeforeFallback);
assert.equal(extensionCalls, 4);
console.log(
  'PASS: both formats, registration/authentication, native/package toJSON and fallback serialization'
);
