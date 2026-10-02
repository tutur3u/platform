import { NextResponse } from 'next/server';

/** A subscription model can never enter gateway allocation or credit billing. */
export function validateSubscriptionRoute(
  model: string | undefined,
  subscription: boolean
) {
  if (!subscription && model?.trim().toLowerCase().startsWith('chatgpt/')) {
    return NextResponse.json(
      {
        error: 'Use the ChatGPT subscription endpoint for this model',
        code: 'CHATGPT_ROUTE_REQUIRED',
      },
      { status: 400 }
    );
  }
}
