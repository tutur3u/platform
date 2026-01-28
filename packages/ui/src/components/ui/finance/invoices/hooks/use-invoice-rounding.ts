'use client';

import { useEffect, useState } from 'react';

export function useInvoiceRounding(totalBeforeRounding: number) {
  const [roundedTotal, setRoundedTotal] = useState(totalBeforeRounding);

  useEffect(() => {
    setRoundedTotal(totalBeforeRounding);
  }, [totalBeforeRounding]);

  const roundUp = () => {
    setRoundedTotal(Math.ceil(Math.round(totalBeforeRounding) / 1000) * 1000);
  };

  const roundDown = () => {
    setRoundedTotal(Math.floor(Math.round(totalBeforeRounding) / 1000) * 1000);
  };

  const resetRounding = () => {
    setRoundedTotal(totalBeforeRounding);
  };

  const roundingDelta = roundedTotal - totalBeforeRounding;

  return {
    roundedTotal,
    roundUp,
    roundDown,
    resetRounding,
    roundingDelta,
  };
}
