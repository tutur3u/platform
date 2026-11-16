import { SORBET_PRE_PAINT_SCRIPT } from './sorbet-pre-paint-script';

export {
  SORBET_PRE_PAINT_SCRIPT,
  SORBET_PRE_PAINT_SCRIPT_HASH,
} from './sorbet-pre-paint-script';

/**
 * Renders the pre-paint script. Mount it once per document, outside any
 * Suspense boundary (beside the theme provider), so it is part of the first
 * HTML the browser parses. Pass the response's CSP nonce where scripts need one.
 */
export function SorbetPrePaintScript({ nonce }: { nonce?: string }) {
  return (
    <script
      data-cfasync="false"
      nonce={nonce}
      suppressHydrationWarning
      // oxlint-disable-next-line react/no-danger -- a constant script; text children would be escaped
      dangerouslySetInnerHTML={{ __html: SORBET_PRE_PAINT_SCRIPT }}
    />
  );
}
