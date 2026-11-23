import type { MeetOgContent } from './og-content';
import { OG_MARK, OG_THEME } from './og-theme';

export const OG_SIZE = { width: 1200, height: 630 } as const;

function Mark() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="192 64 384 384"
      role="img"
      aria-label="Tuturuuu"
    >
      <path
        fill={OG_MARK.red}
        d="M544 112C544 103.163 536.837 96 528 96C519.163 96 512 103.163 512 112V368C512 376.837 504.837 384 496 384H304C295.163 384 288 391.163 288 400C288 408.837 295.163 416 304 416H512H528C536.837 416 544 408.837 544 400V384V112Z"
      />
      <path
        fill={OG_MARK.orange}
        d="M480 176C480 167.163 472.837 160 464 160C455.163 160 448 167.163 448 176V304C448 312.837 440.837 320 432 320H304C295.163 320 288 327.163 288 336C288 344.837 295.163 352 304 352H448H464C472.837 352 480 344.837 480 336V320V176Z"
      />
      <path
        fill={OG_MARK.green}
        d="M416 176C416 167.163 408.837 160 400 160C391.163 160 384 167.163 384 176V240C384 248.837 376.837 256 368 256H304C295.163 256 288 263.163 288 272C288 280.837 295.163 288 304 288H384H400C408.837 288 416 280.837 416 272V256V176Z"
      />
      <path
        fill={OG_MARK.blue}
        d="M240 96C231.163 96 224 103.163 224 112C224 120.837 231.163 128 240 128H464C472.837 128 480 120.837 480 112C480 103.163 472.837 96 464 96H240ZM256 176C256 167.163 248.837 160 240 160C231.163 160 224 167.163 224 176V400C224 408.837 231.163 416 240 416C248.837 416 256 408.837 256 400V176Z"
      />
    </svg>
  );
}

function Orb({ size, top, right, fill }: Record<string, number | string>) {
  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        width: Number(size),
        height: Number(size),
        top: Number(top),
        right: Number(right),
        borderRadius: 9999,
        background: String(fill),
      }}
    />
  );
}

/** Layout only: every string comes from `buildMeetOgContent`. */
export function MeetOgCard({ content }: { content: MeetOgContent }) {
  const [a, b, c] = OG_THEME.orbs;
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        padding: 40,
        background: OG_THEME.ground,
        color: OG_THEME.foreground,
        position: 'relative',
      }}
    >
      <Orb size={420} top={-120} right={-80} fill={a} />
      <Orb size={260} top={250} right={-110} fill={b} />
      <Orb size={180} top={60} right={300} fill={c} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '44px 56px',
          background: OG_THEME.surface,
          border: `2px solid ${OG_THEME.border}`,
          borderRadius: OG_THEME.cardRadius + 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 30,
          }}
        >
          <Mark />
          <span style={{ fontWeight: 700 }}>Tuturuuu Meet</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {content.eyebrow ? (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                padding: '8px 22px',
                borderRadius: OG_THEME.pill,
                background: OG_THEME.eyebrowFill,
                color: OG_THEME.eyebrowInk,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {content.eyebrow}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              fontSize: content.titleSize,
              lineHeight: 1.08,
              fontWeight: 700,
              maxWidth: 900,
              maxHeight: 250,
              overflow: 'hidden',
            }}
          >
            {content.title}
          </div>
          {content.detail ? (
            <div
              style={{
                display: 'flex',
                fontSize: 28,
                color: OG_THEME.muted,
                maxWidth: 860,
              }}
            >
              {content.detail}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              padding: '16px 34px',
              borderRadius: OG_THEME.pill,
              background: OG_THEME.primary,
              color: OG_THEME.primaryForeground,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {`${content.cta} →`}
          </div>
          <span style={{ fontSize: 26, color: OG_THEME.muted }}>
            {content.footer}
          </span>
        </div>
      </div>
    </div>
  );
}
