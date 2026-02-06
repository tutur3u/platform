export const ALLOWED_MODELS = [
  {
    name: 'gemini-2.0-flash',
    price: {
      per1MInputTokens: 0.1,
      per1MOutputTokens: 0.4,
      per1MReasoningTokens: 0.4,
    },
  },
  {
    name: 'gemini-2.0-flash-lite',
    price: {
      per1MInputTokens: 0.075,
      per1MOutputTokens: 0.3,
      per1MReasoningTokens: 0.3,
    },
  },
  {
    name: 'gemini-2.5-flash',
    price: {
      per1MInputTokens: 0.3,
      per1MOutputTokens: 2.5,
      per1MReasoningTokens: 2.5,
    },
  },
  {
    name: 'gemini-2.5-flash-lite',
    price: {
      per1MInputTokens: 0.1,
      per1MOutputTokens: 0.4,
      per1MReasoningTokens: 0.4,
    },
  },
  {
    name: 'gemini-2.5-pro',
    price: {
      per1MInputTokens: 1.25,
      per1MOutputTokens: 10,
      per1MReasoningTokens: 10,
    },
  },
] as const;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  reasoningCost: number;
  totalCostUSD: number;
  totalCostVND: number;
}

export function calculateCost(
  modelName: string,
  usage: TokenUsage,
  exchangeRate = 26000
): CostBreakdown {
  const model = ALLOWED_MODELS.find((model) => model.name === modelName);

  if (!model) {
    throw new Error(`Invalid model: ${modelName}`);
  }

  const inputCost =
    (usage?.inputTokens ?? 0 / 1_000_000) * model.price.per1MInputTokens;
  const outputCost =
    (usage?.outputTokens ?? 0 / 1_000_000) * model.price.per1MOutputTokens;
  const reasoningCost =
    (usage?.reasoningTokens ?? 0 / 1_000_000) *
    model.price.per1MReasoningTokens;

  const totalCostUSD = inputCost + outputCost + reasoningCost;
  const totalCostVND = totalCostUSD * exchangeRate;

  return {
    inputCost,
    outputCost,
    reasoningCost,
    totalCostUSD,
    totalCostVND,
  };
}

export function formatCost(
  cost: number,
  currency: 'USD' | 'VND' = 'USD'
): string {
  if (currency === 'USD') {
    return `$${cost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 })}`;
  } else {
    return cost < 1
      ? `${cost.toFixed(3)} VND`
      : `${cost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} VND`;
  }
}
