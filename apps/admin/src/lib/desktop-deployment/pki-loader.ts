type Pkcs12Store = {
  keys: Array<{ pkcs8: Buffer }>;
  certs: Array<{ cert: Buffer }>;
};

export type PkiApi = {
  pkcs12: {
    open(bytes: Buffer, password: string): Promise<Pkcs12Store>;
  };
  schema: {
    x509: {
      parse(bytes: Buffer): {
        subject: { rdns: Array<Array<{ name: string | null; value: string }>> };
        validity: { notBefore: Date; notAfter: Date };
        extensions: Array<{ oid: string }>;
      };
      decodeExtensions(certificate: unknown): Array<{
        name: string | null;
        decoded?: unknown;
      }>;
    };
  };
};

export function loadDesktopPki(): PkiApi {
  return require('@blamejs/pki') as PkiApi;
}
