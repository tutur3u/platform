// import { ChallengeSelection } from './challenge-selection';
// import { ModelSelection } from './model-selection';
// import { PerformanceMetrics } from './performance-metrics';
// import { ProblemDescription } from './problem-description';
// import { PromptInput } from './prompt-input';
// import { ResultsDisplay } from './results-display';
// import { useToast } from './use-toast';
// import { Card } from '@tuturuuu/ui/card';
// import {
//   ResizableHandle,
//   ResizablePanel,
//   ResizablePanelGroup,
// } from '@tuturuuu/ui/resizable';
// import { useEffect, useState } from 'react';

// export interface Challenge {
//   id?: number | null;
//   title?: string | null;
//   topic?: string| null;
//   description?: string| null;
//   exampleInput?: string| null;
//   exampleOutput?: string| null;
// }

// export function Playground({
//   initialChallenges,
// }: {
//   initialChallenges: Challenge[];
// }) {
//   const [challenges] = useState<Challenge[]>(initialChallenges);
//   const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(
//     challenges.length > 0 ? challenges[0] : null
//   );
//   const [prompt, setPrompt] = useState('');
//   const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
//   const [results, setResults] = useState<string[]>([]);
//   const [isLoading, setIsLoading] = useState(false);
//   const [metrics, setMetrics] = useState({ tokenCount: 0, responseTime: 0 });
//   const { toast } = useToast();

//   const handleSubmit = async () => {
//     if (prompt.trim() === '') {
//       toast({
//         title: 'Empty Prompt',
//         description: 'Please enter a prompt before submitting.',
//         variant: 'destructive',
//       });
//       return;
//     }

//     setIsLoading(true);
//     // Simulating API call
//     await new Promise((resolve) => setTimeout(resolve, 2000));
//     const newResult = `This is a simulated response for the prompt: "${prompt}"`;
//     setResults([newResult, ...results]);
//     setMetrics({
//       tokenCount: prompt.split(' ').length * 2,
//       responseTime: Math.floor(Math.random() * 1000) + 500, // Simulated response time
//     });
//     setIsLoading(false);
//   };

//   const handleGeneratePrompt = () => {
//     const generatedPrompt = `Here's a generated prompt for the ${currentChallenge?.title} challenge: Analyze the given text and provide a concise summary highlighting the main points.`;
//     setPrompt(generatedPrompt);
//     toast({
//       title: 'Prompt Generated',
//       description: 'A new prompt has been generated for you.',
//     });
//   };

//   useEffect(() => {
//     setPrompt('');
//     setResults([]);
//   }, [currentChallenge]);

//   if (!currentChallenge) {
//     return <div>No challenges available</div>;
//   }

//   return (
//     <div className="container mx-auto h-[calc(100vh-4rem)] p-4">
//       <div className="mb-4 flex items-center justify-between">
//         <ChallengeSelection
//           challenges={challenges}
//           currentChallenge={currentChallenge}
//           onSelectChallenge={setCurrentChallenge}
//         />
//         <ModelSelection
//           selectedModel={selectedModel}
//           setSelectedModel={setSelectedModel}
//         />
//       </div>
//       <ResizablePanelGroup
//         direction="horizontal"
//         className="min-h-[calc(100vh-8rem)] rounded-lg border"
//       >
//         <ResizablePanel defaultSize={30} minSize={20}>
//           <ProblemDescription challenge={currentChallenge} />
//         </ResizablePanel>
//         <ResizableHandle />
//         <ResizablePanel defaultSize={70}>
//           <ResizablePanelGroup direction="vertical">
//             <ResizablePanel defaultSize={70} minSize={30}>
//               <Card className="h-full">
//                 <PromptInput
//                   prompt={prompt}
//                   setPrompt={setPrompt}
//                   onSubmit={handleSubmit}
//                   onGenerate={handleGeneratePrompt}
//                   isLoading={isLoading}
//                 />
//               </Card>
//             </ResizablePanel>
//             <ResizableHandle />
//             <ResizablePanel defaultSize={30}>
//               <Card className="h-full">
//                 <ResultsDisplay results={results} isLoading={isLoading} />
//               </Card>
//             </ResizablePanel>
//           </ResizablePanelGroup>
//         </ResizablePanel>
//       </ResizablePanelGroup>
//       <div className="mt-4">
//         <PerformanceMetrics metrics={metrics} />
//       </div>
//     </div>
//   );
// }
