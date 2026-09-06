declare module 'mailauth/lib/dkim/verify' {
  export function dkimVerify(
    input: Buffer,
    options?: {
      resolver?: (name: string, type: string) => Promise<string[][]>;
    }
  ): Promise<{
    headerFrom: string[];
    results: Array<{
      signingDomain?: string;
      canonBodyLengthLimited?: boolean;
      signatureTimeValid?: boolean;
      status: { result: string };
    }>;
  }>;
}

declare module 'mailauth/lib/dkim/sign' {
  export function dkimSign(
    input: Buffer,
    options: {
      signatureData: Array<{
        signingDomain: string;
        selector: string;
        privateKey: string;
      }>;
    }
  ): Promise<{ signatures: string; errors: unknown[] }>;
}
