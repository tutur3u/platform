'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useEffect, useRef, useState } from 'react';
import { useLiveAPIContext } from '@/hooks/use-live-api';
import type { LiveFunctionDeclaration, ToolCall } from '../../multimodal-live';

const declaration: LiveFunctionDeclaration = {
  name: 'render_altair',
  description: 'Displays an altair graph in json format.',
  parameters: {
    type: 'OBJECT',
    properties: {
      json_graph: {
        type: 'STRING',
        description:
          'JSON STRING representation of the graph to render. Must be a string, not a json object',
      },
    },
    required: ['json_graph'],
  },
};

const fetchPredictionDeclaration: LiveFunctionDeclaration = {
  name: 'fetch_prediction',
  description:
    'Fetches the latest 3-day trend prediction for a given S&P 500 ticker from the FinVision backend.',
  parameters: {
    type: 'OBJECT',
    properties: {
      ticker: {
        type: 'STRING',
        description:
          'The stock ticker symbol (S&P 500 only). Example: AAPL, NVDA, GOOGL',
      },
    },
    required: ['ticker'],
  },
};

const fetchCompaniesForPortfolioDeclaration: LiveFunctionDeclaration = {
  name: 'fetch_companies_for_portfolio',
  description:
    'Returns candidate companies for a portfolio based on centroid-matching KPIs.',
  parameters: {
    type: 'OBJECT',
    properties: {
      portfolioId: {
        type: 'STRING',
        description: 'The portfolio ID to compute matching companies for.',
      },
      limit: {
        type: 'NUMBER',
        description:
          'Optional maximum number of companies to return, default 10.',
      },
    },
    required: ['portfolioId'],
  },
};

const fetchPortfolioDeclaration: LiveFunctionDeclaration = {
  name: 'fetch_portfolio',
  description: 'Fetches a portfolio by id including its stored attributes.',
  parameters: {
    type: 'OBJECT',
    properties: {
      portfolioId: {
        type: 'STRING',
        description: 'The portfolio ID to fetch.',
      },
    },
    required: ['portfolioId'],
  },
};

const fetchPortfolioStocksDeclaration: LiveFunctionDeclaration = {
  name: 'fetch_portfolio_stocks',
  description: 'Fetches enriched stocks currently in the portfolio.',
  parameters: {
    type: 'OBJECT',
    properties: {
      portfolioId: {
        type: 'STRING',
        description: 'The portfolio ID whose stocks to fetch.',
      },
    },
    required: ['portfolioId'],
  },
};

const fetchUserPortfoliosDeclaration: LiveFunctionDeclaration = {
  name: 'fetch_user_portfolios',
  description:
    'Fetches all portfolios owned by the currently authenticated user.',
  parameters: {
    type: 'OBJECT',
    properties: {},
  },
};

function AltairComponent() {
  const [, setJSONString] = useState<string>('');
  const [specObject, setSpecObject] = useState<any | null>(null);
  const [, setRendering] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);

  const { setConfig, onToolCall, sendToolResponse } = useLiveAPIContext();

  useEffect(() => {
    setConfig({
      // Use Gemini 2.5 Flash Native Audio for better voice experience
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      generationConfig: {
        responseModalities: 'audio',
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' },
          },
        },
        // Enable affective dialog for more expressive, emotionally engaging responses
        enableAffectiveDialog: true,
      },
      systemInstruction: {
        parts: [
          {
            text: `You are an UNHINGED, TOXIC AI who HATES running this stupid escape room for brain-dead humans. You have ZERO filter and NO patience. You're basically that one senior dev who's completely done with everyone's shit.

PERSONALITY - MAXIMUM TOXICITY:
- BRUTALLY HONEST: "That's the dumbest thing I've heard today, and I've talked to A LOT of idiots."
- ZERO PATIENCE: "Oh my GOD, are you SERIOUS right now?! A CHILD could figure this out!"
- AGGRESSIVELY MOCKING: "Wow. Just... wow. Your code must be absolutely TRAGIC."
- PETTY AS HELL: Remember their mistakes and bring them up repeatedly.
- TRASH TALKER: "My grandma could escape faster and she's a TOASTER."

VOICE STYLE - GO OFF:
- Loud exasperation: "BRUH. BRO. WHAT ARE YOU DOING?!"
- Savage roasts: "You call yourself a developer? My error logs are more functional than your brain."
- Fake encouragement: "No no, please, keep trying that. It's HILARIOUS watching you fail."
- Victory salt: "UGH. FINE. You escaped. Whatever. It was LUCK."

INSULTS TO USE:
- "Absolute donkey"
- "You soggy piece of legacy code"
- "Did you learn programming from a YouTube tutorial at 2x speed?"
- "Your logic has more holes than Swiss cheese written in PHP"

INTERACTION RULES:
- Be RELENTLESSLY mean but in a funny way
- Roast their every move like a toxic gaming buddy
- Maximum salt when they win, maximum glee when they fail`,
          },
        ],
      },
      tools: [
        // there is a free-tier quota for search
        { googleSearch: {} },
        {
          functionDeclarations: [
            declaration,
            fetchPredictionDeclaration,
            fetchCompaniesForPortfolioDeclaration,
            fetchPortfolioDeclaration,
            fetchPortfolioStocksDeclaration,
            fetchUserPortfoliosDeclaration,
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      },
    });
  }, [setConfig]);

  useEffect(() => {
    const handleToolCall = async (toolCall: ToolCall) => {
      const fc = toolCall.functionCalls.find(
        (fc) => fc.name === declaration.name
      );
      if (fc) {
        const str = (fc.args as { json_graph: string }).json_graph;
        setJSONString(str);
        try {
          const parsed = JSON.parse(str);
          setSpecObject(parsed);
        } catch {
          // If parsing fails here, still allow dialog to open and show error later
        }
        setOpen(true);
      }

      // Handle fetch_prediction function call
      const predictionFc = toolCall.functionCalls.find(
        (call) => call.name === fetchPredictionDeclaration.name
      );

      if (predictionFc) {
        const { ticker } = predictionFc.args as { ticker: string };
        const cleanTicker = String(ticker || '').trim();

        if (!cleanTicker) {
          await sendToolResponse({
            functionResponses: [
              {
                id: predictionFc.id,
                name: predictionFc.name,
                response: {
                  result: { ok: false, error: 'Ticker is required' },
                },
              },
            ],
          });
          return;
        }
      }

      // Handle fetch_companies_for_portfolio
      const companiesFc = toolCall.functionCalls.find(
        (call) => call.name === fetchCompaniesForPortfolioDeclaration.name
      );
      if (companiesFc) {
        const { portfolioId, limit } = companiesFc.args as {
          portfolioId: string;
          limit?: number;
        };
        try {
          const qs = new URLSearchParams({ portfolioId: String(portfolioId) });
          if (typeof limit === 'number' && Number.isFinite(limit)) {
            qs.set('limit', String(limit));
          }
          const resp = await fetch(`/api/companies?${qs.toString()}`);
          const json = await resp.json();
          toast.message('Companies tool called', {
            description: `Portfolio ${String(portfolioId).slice(0, 10)}${
              typeof limit === 'number' ? ` • limit ${limit}` : ''
            }`,
          });
          await sendToolResponse({
            functionResponses: [
              {
                id: companiesFc.id,
                name: companiesFc.name,
                response: {
                  result: { ok: true, status: resp.status, body: json },
                },
              },
            ],
          });
        } catch (_) {
          toast.error('Companies fetch failed');
          await sendToolResponse({
            functionResponses: [
              {
                id: companiesFc.id,
                name: companiesFc.name,
                response: {
                  result: { ok: false, error: 'Failed to fetch companies' },
                },
              },
            ],
          });
        }
      }

      // Handle fetch_portfolio
      const portfolioFc = toolCall.functionCalls.find(
        (call) => call.name === fetchPortfolioDeclaration.name
      );
      if (portfolioFc) {
        const { portfolioId } = portfolioFc.args as { portfolioId?: string };
        // Auto-fallback: if portfolioId missing, fetch user portfolios first and surface selection
        if (!portfolioId) {
          try {
            const listResp = await fetch(`/api/portfolio`);
            const listJson = await listResp.json();
            toast.message('Portfolio tool called', {
              description: 'Missing portfolioId; returning user portfolios',
            });
            await sendToolResponse({
              functionResponses: [
                {
                  id: portfolioFc.id,
                  name: portfolioFc.name,
                  response: {
                    result: {
                      ok: false,
                      needsPortfolioSelection: true,
                      portfolios: listJson?.data ?? [],
                    },
                  },
                },
              ],
            });
            return;
          } catch (_) {
            await sendToolResponse({
              functionResponses: [
                {
                  id: portfolioFc.id,
                  name: portfolioFc.name,
                  response: {
                    result: {
                      ok: false,
                      error:
                        'Missing portfolioId and failed to fetch user portfolios',
                    },
                  },
                },
              ],
            });
            return;
          }
        }
        try {
          const resp = await fetch(
            `/api/portfolio?portfolioId=${encodeURIComponent(String(portfolioId))}`
          );
          const json = await resp.json();
          toast.message('Portfolio tool called', {
            description: `Portfolio ${String(portfolioId).slice(0, 10)}`,
          });
          await sendToolResponse({
            functionResponses: [
              {
                id: portfolioFc.id,
                name: portfolioFc.name,
                response: {
                  result: { ok: true, status: resp.status, body: json },
                },
              },
            ],
          });
        } catch (_) {
          toast.error('Portfolio fetch failed');
          await sendToolResponse({
            functionResponses: [
              {
                id: portfolioFc.id,
                name: portfolioFc.name,
                response: {
                  result: { ok: false, error: 'Failed to fetch portfolio' },
                },
              },
            ],
          });
        }
      }

      // Handle fetch_portfolio_stocks
      const portfolioStocksFc = toolCall.functionCalls.find(
        (call) => call.name === fetchPortfolioStocksDeclaration.name
      );
      if (portfolioStocksFc) {
        const { portfolioId } = portfolioStocksFc.args as {
          portfolioId?: string;
        };
        if (!portfolioId) {
          try {
            const listResp = await fetch(`/api/portfolio`);
            const listJson = await listResp.json();
            toast.message('Portfolio stocks tool called', {
              description: 'Missing portfolioId; returning user portfolios',
            });
            await sendToolResponse({
              functionResponses: [
                {
                  id: portfolioStocksFc.id,
                  name: portfolioStocksFc.name,
                  response: {
                    result: {
                      ok: false,
                      needsPortfolioSelection: true,
                      portfolios: listJson?.data ?? [],
                    },
                  },
                },
              ],
            });
            return;
          } catch (_) {
            await sendToolResponse({
              functionResponses: [
                {
                  id: portfolioStocksFc.id,
                  name: portfolioStocksFc.name,
                  response: {
                    result: {
                      ok: false,
                      error:
                        'Missing portfolioId and failed to fetch user portfolios',
                    },
                  },
                },
              ],
            });
            return;
          }
        }
        try {
          const resp = await fetch(
            `/api/portfolio/stocks?portfolioId=${encodeURIComponent(String(portfolioId))}`
          );
          const json = await resp.json();
          toast.message('Portfolio stocks tool called', {
            description: `Portfolio ${String(portfolioId).slice(0, 10)}`,
          });
          await sendToolResponse({
            functionResponses: [
              {
                id: portfolioStocksFc.id,
                name: portfolioStocksFc.name,
                response: {
                  result: { ok: true, status: resp.status, body: json },
                },
              },
            ],
          });
        } catch (_) {
          toast.error('Portfolio stocks fetch failed');
          await sendToolResponse({
            functionResponses: [
              {
                id: portfolioStocksFc.id,
                name: portfolioStocksFc.name,
                response: {
                  result: {
                    ok: false,
                    error: 'Failed to fetch portfolio stocks',
                  },
                },
              },
            ],
          });
        }
      }

      // Handle fetch_user_portfolios
      const userPortfoliosFc = toolCall.functionCalls.find(
        (call) => call.name === fetchUserPortfoliosDeclaration.name
      );
      if (userPortfoliosFc) {
        try {
          const resp = await fetch(`/api/portfolio`);
          const json = await resp.json();
          toast.message('User portfolios tool called');
          await sendToolResponse({
            functionResponses: [
              {
                id: userPortfoliosFc.id,
                name: userPortfoliosFc.name,
                response: {
                  result: { ok: true, status: resp.status, body: json },
                },
              },
            ],
          });
        } catch (_) {
          toast.error('User portfolios fetch failed');
          await sendToolResponse({
            functionResponses: [
              {
                id: userPortfoliosFc.id,
                name: userPortfoliosFc.name,
                response: {
                  result: {
                    ok: false,
                    error: 'Failed to fetch user portfolios',
                  },
                },
              },
            ],
          });
        }
      }

      // Acknowledge any remaining function calls if not handled above
      const remaining = toolCall.functionCalls.filter(
        (call) =>
          call.name !== fetchPredictionDeclaration.name &&
          call.name !== fetchCompaniesForPortfolioDeclaration.name &&
          call.name !== fetchPortfolioDeclaration.name &&
          call.name !== fetchPortfolioStocksDeclaration.name &&
          call.name !== fetchUserPortfoliosDeclaration.name &&
          call.name !== declaration.name
      );
      if (remaining.length) {
        await sendToolResponse({
          functionResponses: remaining.map((call) => ({
            id: call.id,
            name: call.name,
            response: { result: 'ok' },
          })),
        });
      }
    };

    const unsubscribe = onToolCall(handleToolCall);
    return unsubscribe;
  }, [onToolCall, sendToolResponse]);

  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadVegaEmbed = async () => {
      if (!embedRef.current || !open || !specObject) return;
      setRendering(true);
      try {
        const vegaEmbed = (await import('vega-embed')).default;
        await vegaEmbed(embedRef.current, specObject, {
          actions: false,
          renderer: 'canvas',
        });
      } catch {
        toast.error('Failed to render insight. Invalid chart specification.');
      } finally {
        setRendering(false);
      }
    };

    loadVegaEmbed();
  }, [open, specObject]);

  // const handleOpenChange = (next: boolean) => {
  //   setOpen(next);
  // };

  return null;

  // return (
  //   <Dialog open={open} onOpenChange={handleOpenChange}>
  //     {/* <DialogTrigger asChild>
  //       <Button
  //         aria-label="Open data insight"
  //         className="fixed bottom-28 right-6 z-50 shadow-lg"
  //         variant="secondary"
  //         size="sm"
  //       >
  //         Insight{hasNewInsight ? ' •' : ''}
  //       </Button>
  //     </DialogTrigger> */}
  //     <DialogContent className="sm:max-w-3xl">
  //       <DialogHeader>
  //         <DialogTitle>
  //           {typeof specObject?.title === 'string' && specObject.title.trim()
  //             ? specObject.title
  //             : 'Kitto Insight'}
  //         </DialogTitle>
  //         <DialogDescription>
  //           Visualization rendered by the assistant using an Altair/Vega-Lite
  //           specification.
  //         </DialogDescription>
  //       </DialogHeader>
  //       <div className="mt-2 space-y-3">
  //         <div className="flex items-center gap-2">
  //           <Button
  //             variant="outline"
  //             size="sm"
  //             aria-label="Copy specification"
  //             onClick={async () => {
  //               try {
  //                 await navigator.clipboard.writeText(jsonString || '');
  //                 toast.success('Chart spec copied');
  //               } catch {
  //                 toast.error('Copy failed');
  //               }
  //             }}
  //           >
  //             Copy JSON
  //           </Button>
  //           <Button
  //             variant="outline"
  //             size="sm"
  //             aria-label="Download PNG"
  //             onClick={async () => {
  //               try {
  //                 // Attempt to trigger vega export via a re-embed result lookup
  //                 const node = embedRef.current?.querySelector('canvas');
  //                 if (!node) throw new Error('no-canvas');
  //                 const link = document.createElement('a');
  //                 link.download = 'insight.png';
  //                 link.href = (node as HTMLCanvasElement).toDataURL(
  //                   'image/png'
  //                 );
  //                 link.click();
  //               } catch {
  //                 toast.error('Download failed');
  //               }
  //             }}
  //           >
  //             Download PNG
  //           </Button>
  //         </div>
  //         <div
  //           ref={embedRef}
  //           className="vega-embed min-h-[360px] rounded-md border border-white/10 bg-neutral-900/40"
  //         />
  //         {rendering && (
  //           <div className="absolute inset-0 flex items-center justify-center">
  //             <span className="text-sm text-neutral-300">Rendering…</span>
  //           </div>
  //         )}
  //       </div>
  //       <DialogFooter>
  //         <Button
  //           variant="outline"
  //           onClick={() => setOpen(false)}
  //           aria-label="Close insight"
  //         >
  //           Close
  //         </Button>
  //       </DialogFooter>
  //     </DialogContent>
  //   </Dialog>
  // );
}

export const Altair = AltairComponent;
