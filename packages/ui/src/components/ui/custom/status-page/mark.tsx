/**
 * The Tuturuuu mark as inline SVG (the four bars of
 * `apps/marketing/public/media/branding/brand-mark-light.svg`). Inline, so the
 * status page makes no image request and needs no `img-src` allowance on any
 * origin it is mounted under.
 */
export function TuturuuuMark() {
  return (
    <svg
      aria-hidden="true"
      data-tuturuuu-mark=""
      focusable="false"
      height="28"
      viewBox="0 0 512 512"
      width="28"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d="M512 25.6C512 11.4615 500.538 0 486.4 0C472.262 0 460.8 11.4615 460.8 25.6V428.8C460.8 446.473 446.473 460.8 428.8 460.8H128C113.862 460.8 102.4 472.262 102.4 486.4C102.4 500.538 113.861 512 128 512H460.8H480C497.673 512 512 497.673 512 480V460.8V25.6Z"
        fill="#E94646"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M409.6 128C409.6 113.861 398.138 102.4 384 102.4C369.862 102.4 358.4 113.861 358.4 128V326.4C358.4 344.073 344.073 358.4 326.4 358.4H128C113.862 358.4 102.4 369.861 102.4 384C102.4 398.138 113.861 409.6 128 409.6L358.4 409.6H377.6C395.273 409.6 409.6 395.273 409.6 377.6V358.4V128Z"
        fill="#FB7B05"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M307.2 128C307.2 113.861 295.738 102.4 281.6 102.4C267.462 102.4 256 113.861 256 128V224C256 241.673 241.673 256 224 256H128C113.862 256 102.4 267.461 102.4 281.6C102.4 295.738 113.861 307.2 128 307.2L256 307.2H275.2C292.873 307.2 307.2 292.873 307.2 275.2V256V128Z"
        fill="#4ACA3F"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M25.6 0C11.4615 0 0 11.4615 0 25.6C0 39.7385 11.4615 51.2 25.6 51.2H384C398.138 51.2 409.6 39.7385 409.6 25.6C409.6 11.4615 398.138 0 384 0H25.6ZM51.2 128C51.2 113.862 39.7385 102.4 25.6 102.4C11.4615 102.4 0 113.862 0 128V486.4C0 500.538 11.4615 512 25.6 512C39.7385 512 51.2 500.538 51.2 486.4V128Z"
        fill="#4180E9"
        fillRule="evenodd"
      />
    </svg>
  );
}
