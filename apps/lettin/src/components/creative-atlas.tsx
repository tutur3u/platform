/** A quiet, decorative illustration; navigation lives in the spaces below. */
export function CreativeAtlas() {
  return (
    <div className="creative-atlas" aria-hidden="true">
      <div className="atlas-scene">
        <div className="atlas-sun" />
        <svg
          aria-hidden="true"
          className="atlas-landscape"
          viewBox="0 0 600 500"
          fill="none"
        >
          <path
            className="atlas-mountain-back"
            d="M0 390 120 200 200 280 340 95 480 300 600 180V500H0Z"
          />
          <path
            className="atlas-mountain-front"
            d="M0 440 110 330 215 395 375 260 600 440V500H0Z"
          />
          <path
            className="atlas-river"
            d="M340 95c-60 130 110 170 35 230S190 360 240 500"
          />
          <path
            className="atlas-path"
            d="M45 410c80-160 160-10 205-140s150-80 245-180"
          />
          <circle className="atlas-pin" cx="250" cy="270" r="9" />
          <circle className="atlas-pin" cx="495" cy="90" r="9" />
          <path
            className="atlas-star"
            d="m120 100 10 26 26 10-26 10-10 26-10-26-26-10 26-10Z"
          />
          <path
            className="atlas-star"
            d="m460 350 7 18 18 7-18 7-7 18-7-18-18-7 18-7Z"
          />
        </svg>
      </div>
    </div>
  );
}
