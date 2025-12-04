'use client';

import { useEphemeralToken } from '@/hooks/use-ephemeral-token';
import { LiveAPIProvider, useLiveAPIContext } from '@/hooks/use-live-api';
import { Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioRecorder } from './audio/audio-recorder';
import type { GroundingMetadata } from './audio/multimodal-live-client';
import { ChatBox } from './components/chat-box/chat-box';
import ControlTray from './components/control-tray/control-tray';
import { VisualizationContainer } from './components/visualizations/visualization-container';
import type { ServerContent, ToolCall } from './multimodal-live';
import { isModelTurn } from './multimodal-live';
import { useVisualizationStore } from './stores/visualization-store';
import type {
  CoreMentionVisualization,
  GoogleSearchVisualization,
  VisualizationToolResponse,
} from './types/visualizations';

function useAudioRecorder() {
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isRecorderReady, setIsRecorderReady] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const lastSpeakingTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      recorderRef.current = new AudioRecorder();
      setIsRecorderReady(true);
      return () => {
        recorderRef.current?.stop();
        setIsRecorderReady(false);
      };
    }
  }, []);

  useEffect(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const handleVolume = (volume: number) => {
      const speaking = volume > 0.1;
      setIsUserSpeaking(speaking);

      if (speaking) {
        lastSpeakingTimeRef.current = Date.now();
      }
    };

    recorder.on('volume', handleVolume);
    return () => {
      recorder.off('volume', handleVolume);
    };
  }, []);

  return { isUserSpeaking, isRecorderReady, recorder: recorderRef.current };
}

// Vibrant color palette for the aurora effect
const AURORA_COLORS = {
  purple: '#a855f7',
  violet: '#8b5cf6',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  pink: '#ec4899',
  rose: '#f43f5e',
  amber: '#f59e0b',
};

// Floating particle component for ambient effect
function FloatingParticle({
  index,
  connected,
}: {
  index: number;
  connected: boolean;
}) {
  const totalParticles = 16;
  const angle = (index / totalParticles) * Math.PI * 2;
  const baseRadius = 165 + (index % 3) * 20;
  const size = 3 + (index % 3) * 2;

  const colors = [
    AURORA_COLORS.purple,
    AURORA_COLORS.blue,
    AURORA_COLORS.pink,
    AURORA_COLORS.cyan,
    AURORA_COLORS.violet,
    AURORA_COLORS.rose,
  ];
  const color = colors[index % colors.length];

  // Fixed orbital path - independent of volume
  const innerRadius = baseRadius;
  const outerRadius = baseRadius + 25;

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left: '50%',
        top: '50%',
        marginLeft: -size / 2,
        marginTop: -size / 2,
        background: color,
        boxShadow: `0 0 10px ${color}, 0 0 20px ${color}40`,
      }}
      initial={{
        x: Math.cos(angle) * baseRadius,
        y: Math.sin(angle) * baseRadius,
        opacity: 0,
      }}
      animate={{
        x: [
          Math.cos(angle) * innerRadius,
          Math.cos(angle + Math.PI * 0.5) * outerRadius,
          Math.cos(angle + Math.PI) * innerRadius,
          Math.cos(angle + Math.PI * 1.5) * outerRadius,
          Math.cos(angle + Math.PI * 2) * innerRadius,
        ],
        y: [
          Math.sin(angle) * innerRadius,
          Math.sin(angle + Math.PI * 0.5) * outerRadius,
          Math.sin(angle + Math.PI) * innerRadius,
          Math.sin(angle + Math.PI * 1.5) * outerRadius,
          Math.sin(angle + Math.PI * 2) * innerRadius,
        ],
        opacity: connected ? [0.5, 0.7, 0.5, 0.65, 0.5] : 0.2,
        scale: [1, 1.15, 1, 1.1, 1],
      }}
      transition={{
        duration: 10 + index * 0.8,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  );
}

// Beautiful multi-layered aurora blob
function AuroraBlob({
  connected,
  isUserSpeaking,
  isSpeaking,
  volume,
}: {
  connected: boolean;
  isUserSpeaking: boolean;
  isSpeaking: boolean;
  volume: number;
}) {
  // Scale response driven by actual audio volume
  const amplitude = useMotionValue(0);
  const amplitudeSpring = useSpring(amplitude, {
    stiffness: 150,
    damping: 18,
    mass: 0.6,
  });

  const blobScale = useTransform(amplitudeSpring, (v) => 0.98 + v * 0.1);

  // Brightness boost for speaking
  const brightness = useMotionValue(0);
  const brightnessSpring = useSpring(brightness, {
    stiffness: 120,
    damping: 20,
  });
  const coreOpacity = useTransform(brightnessSpring, (v) => 0.5 + v * 0.4);
  const coreScale = useTransform(brightnessSpring, (v) => 1 + v * 0.12);
  const glowOpacity = useTransform(brightnessSpring, (v) => 0.4 + v * 0.45);

  // Rotation for organic movement
  const rotation = useMotionValue(0);
  const rotationSpring = useSpring(rotation, { stiffness: 15, damping: 25 });

  // Update amplitude based on volume when AI is speaking
  useEffect(() => {
    if (isSpeaking && volume > 0) {
      // Use actual volume for dynamic scaling (volume is typically 0-1)
      const volumeBoost = Math.min(volume * 1.5, 1);
      amplitude.set(0.3 + volumeBoost * 0.7);
      brightness.set(0.3 + volumeBoost * 0.7);
    } else if (isUserSpeaking) {
      amplitude.set(0.6);
      brightness.set(0.7);
    } else if (connected) {
      amplitude.set(0.15);
      brightness.set(0);
    } else {
      amplitude.set(0.05);
      brightness.set(0);
    }

    // Subtle rotation based on activity
    rotation.set((isUserSpeaking ? 5 : 0) + (isSpeaking ? -5 : 0));
  }, [
    connected,
    amplitude,
    brightness,
    isUserSpeaking,
    isSpeaking,
    volume,
    rotation,
  ]);

  // Generate particles
  const particles = useMemo(() => Array.from({ length: 16 }, (_, i) => i), []);

  const baseOpacity = connected ? 0.85 : 0.4;

  return (
    <motion.div
      className="pointer-events-none relative flex items-center justify-center"
      style={{
        width: '50vmin',
        maxWidth: '420px',
        aspectRatio: '1',
        scale: blobScale,
        rotate: rotationSpring,
      }}
    >
      {/* Outer glow halo - reactive to speaking */}
      <motion.div
        className="absolute inset-[-30%]"
        style={{
          background: `radial-gradient(circle,
            ${AURORA_COLORS.purple}18 0%,
            ${AURORA_COLORS.blue}12 30%,
            ${AURORA_COLORS.pink}08 50%,
            transparent 70%)`,
          filter: 'blur(40px)',
          opacity: connected ? glowOpacity : 0.25,
          borderRadius: '70% 30% 55% 45% / 35% 65% 30% 70%',
        }}
        animate={{
          scale: [1, 1.03, 0.99, 1.01, 1],
          borderRadius: [
            '70% 30% 55% 45% / 35% 65% 30% 70%',
            '35% 65% 30% 70% / 70% 30% 55% 45%',
            '55% 45% 70% 30% / 45% 55% 65% 35%',
            '30% 70% 45% 55% / 55% 45% 35% 65%',
            '70% 30% 55% 45% / 35% 65% 30% 70%',
          ],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 1: Large purple base - slowest */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 25% 25%,
            ${AURORA_COLORS.purple} 0%,
            ${AURORA_COLORS.violet}90 30%,
            transparent 70%)`,
          filter: 'blur(30px)',
          opacity: baseOpacity,
          borderRadius: '70% 30% 60% 40% / 40% 60% 30% 70%',
        }}
        animate={{
          scale: connected
            ? [1, 1.03, 0.99, 1.02, 1]
            : [0.92, 0.94, 0.93, 0.92],
          x: [0, 12, -4, -10, 0],
          y: [0, -10, 6, -4, 0],
          borderRadius: [
            '70% 30% 60% 40% / 40% 60% 30% 70%',
            '40% 60% 30% 70% / 70% 30% 60% 40%',
            '30% 70% 50% 50% / 50% 50% 70% 30%',
            '60% 40% 70% 30% / 30% 70% 40% 60%',
            '70% 30% 60% 40% / 40% 60% 30% 70%',
          ],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 2: Vibrant blue */}
      <motion.div
        className="absolute inset-[5%]"
        style={{
          background: `radial-gradient(circle at 75% 35%,
            ${AURORA_COLORS.blue} 0%,
            ${AURORA_COLORS.cyan}80 40%,
            transparent 70%)`,
          filter: 'blur(25px)',
          opacity: baseOpacity,
          borderRadius: '35% 65% 70% 30% / 60% 35% 65% 40%',
        }}
        animate={{
          scale: connected
            ? [0.99, 1.04, 0.97, 1.01, 0.99]
            : [0.88, 0.9, 0.89, 0.88],
          x: [-6, 10, -8, -12, -6],
          y: [6, -8, 10, -5, 6],
          rotate: [0, 90, 180, 270, 360],
          borderRadius: [
            '35% 65% 70% 30% / 60% 35% 65% 40%',
            '65% 35% 30% 70% / 35% 65% 40% 60%',
            '50% 50% 65% 35% / 70% 30% 35% 65%',
            '30% 70% 40% 60% / 45% 55% 70% 30%',
            '35% 65% 70% 30% / 60% 35% 65% 40%',
          ],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 3: Hot pink accent */}
      <motion.div
        className="absolute inset-[10%]"
        style={{
          background: `radial-gradient(circle at 35% 65%,
            ${AURORA_COLORS.pink} 0%,
            ${AURORA_COLORS.rose}70 35%,
            transparent 65%)`,
          filter: 'blur(20px)',
          opacity: baseOpacity * 0.9,
          borderRadius: '65% 35% 30% 70% / 70% 40% 60% 30%',
        }}
        animate={{
          scale: connected
            ? [1.01, 0.97, 1.03, 0.99, 1.01]
            : [0.82, 0.84, 0.83, 0.82],
          x: [0, -14, 4, 10, 0],
          y: [0, 12, -6, -10, 0],
          rotate: [0, -90, -180, -270, -360],
          borderRadius: [
            '65% 35% 30% 70% / 70% 40% 60% 30%',
            '30% 70% 65% 35% / 40% 60% 30% 70%',
            '45% 55% 70% 30% / 30% 70% 55% 45%',
            '70% 30% 35% 65% / 55% 45% 65% 35%',
            '65% 35% 30% 70% / 70% 40% 60% 30%',
          ],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 4: Cyan sparkle */}
      <motion.div
        className="absolute inset-[20%]"
        style={{
          background: `radial-gradient(circle at 65% 30%,
            ${AURORA_COLORS.cyan} 0%,
            ${AURORA_COLORS.blue}60 30%,
            transparent 55%)`,
          filter: 'blur(15px)',
          opacity: baseOpacity * 0.85,
          borderRadius: '40% 60% 65% 35% / 55% 45% 35% 65%',
        }}
        animate={{
          scale: connected
            ? [0.98, 1.04, 0.96, 1.01, 0.98]
            : [0.72, 0.74, 0.73, 0.72],
          x: [6, -10, 8, 12, 6],
          y: [-6, 10, -8, -10, -6],
          borderRadius: [
            '40% 60% 65% 35% / 55% 45% 35% 65%',
            '60% 40% 35% 65% / 35% 65% 60% 40%',
            '70% 30% 45% 55% / 45% 55% 30% 70%',
            '35% 65% 55% 45% / 65% 35% 45% 55%',
            '40% 60% 65% 35% / 55% 45% 35% 65%',
          ],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Layer 5: Amber warmth accent */}
      <motion.div
        className="absolute inset-[25%]"
        style={{
          background: `radial-gradient(circle at 50% 70%,
            ${AURORA_COLORS.amber}90 0%,
            ${AURORA_COLORS.rose}50 30%,
            transparent 50%)`,
          filter: 'blur(12px)',
          opacity: baseOpacity * 0.6,
          borderRadius: '55% 45% 35% 65% / 65% 35% 55% 45%',
        }}
        animate={{
          scale: connected
            ? [1, 1.04, 0.98, 1.02, 1]
            : [0.66, 0.68, 0.67, 0.66],
          x: [-5, 8, -6, -8, -5],
          y: [5, -8, 6, 8, 5],
          borderRadius: [
            '55% 45% 35% 65% / 65% 35% 55% 45%',
            '35% 65% 55% 45% / 45% 55% 35% 65%',
            '60% 40% 45% 55% / 35% 65% 60% 40%',
            '45% 55% 65% 35% / 55% 45% 40% 60%',
            '55% 45% 35% 65% / 65% 35% 55% 45%',
          ],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Core gradient center */}
      <motion.div
        className="absolute inset-[28%]"
        style={{
          background: `radial-gradient(circle,
            ${AURORA_COLORS.violet}95 0%,
            ${AURORA_COLORS.purple}85 25%,
            ${AURORA_COLORS.blue}60 50%,
            ${AURORA_COLORS.pink}35 75%,
            transparent 100%)`,
          filter: 'blur(10px)',
          opacity: baseOpacity * 0.9,
          borderRadius: '60% 40% 45% 55% / 55% 60% 40% 45%',
        }}
        animate={{
          scale: connected ? [1, 1.03, 0.98, 1.01, 1] : [0.58, 0.6, 0.59, 0.58],
          borderRadius: [
            '60% 40% 45% 55% / 55% 60% 40% 45%',
            '40% 60% 55% 45% / 45% 40% 60% 55%',
            '55% 45% 65% 35% / 35% 55% 45% 65%',
            '45% 55% 35% 65% / 65% 45% 55% 35%',
            '60% 40% 45% 55% / 55% 60% 40% 45%',
          ],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Bright inner core - reactive to speaking */}
      <motion.div
        className="absolute inset-[35%]"
        style={{
          background: `radial-gradient(circle,
            rgba(255,255,255,0.75) 0%,
            ${AURORA_COLORS.violet}65 35%,
            ${AURORA_COLORS.purple}35 65%,
            transparent 100%)`,
          filter: 'blur(10px)',
          opacity: connected ? coreOpacity : 0.25,
          scale: coreScale,
          borderRadius: '55% 45% 60% 40% / 40% 55% 45% 60%',
        }}
        animate={{
          borderRadius: [
            '55% 45% 60% 40% / 40% 55% 45% 60%',
            '40% 60% 45% 55% / 55% 40% 60% 45%',
            '60% 40% 50% 50% / 45% 60% 40% 55%',
            '45% 55% 55% 45% / 60% 45% 55% 40%',
            '55% 45% 60% 40% / 40% 55% 45% 60%',
          ],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Floating particles */}
      {particles.map((i) => (
        <FloatingParticle key={i} index={i} connected={connected} />
      ))}

      {/* Shine highlight */}
      <motion.div
        className="absolute inset-[22%]"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.03) 100%)',
          opacity: connected ? 0.25 : 0.1,
          borderRadius: '65% 35% 45% 55% / 50% 60% 35% 65%',
        }}
        animate={{
          rotate: [0, 360],
          borderRadius: [
            '65% 35% 45% 55% / 50% 60% 35% 65%',
            '35% 65% 55% 45% / 65% 35% 60% 40%',
            '50% 50% 65% 35% / 40% 55% 45% 60%',
            '45% 55% 35% 65% / 55% 45% 60% 40%',
            '65% 35% 45% 55% / 50% 60% 35% 65%',
          ],
        }}
        transition={{
          rotate: { duration: 60, repeat: Infinity, ease: 'linear' },
          borderRadius: { duration: 35, repeat: Infinity, ease: 'easeInOut' },
        }}
      />
    </motion.div>
  );
}

// Status pill component
function StatusPill({
  connected,
  isUserSpeaking,
  isSpeaking,
}: {
  connected: boolean;
  isUserSpeaking: boolean;
  isSpeaking: boolean;
}) {
  const status = !connected
    ? 'Ready to connect'
    : isUserSpeaking
      ? 'Listening...'
      : isSpeaking
        ? 'Speaking...'
        : 'Ready';

  const getStatusStyle = () => {
    if (!connected) {
      return {
        bg: `${AURORA_COLORS.violet}20`,
        text: AURORA_COLORS.violet,
        glow: AURORA_COLORS.violet,
      };
    }
    if (isUserSpeaking) {
      return {
        bg: '#22c55e20',
        text: '#22c55e',
        glow: '#22c55e',
      };
    }
    if (isSpeaking) {
      return {
        bg: `${AURORA_COLORS.cyan}25`,
        text: AURORA_COLORS.cyan,
        glow: AURORA_COLORS.cyan,
      };
    }
    return {
      bg: 'rgba(255,255,255,0.1)',
      text: 'rgba(255,255,255,0.7)',
      glow: 'rgba(255,255,255,0.3)',
    };
  };

  const style = getStatusStyle();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-full px-5 py-2 font-medium text-sm backdrop-blur-sm"
      style={{
        background: style.bg,
        color: style.text,
        boxShadow: connected ? `0 0 20px ${style.glow}30` : 'none',
      }}
    >
      <span className="flex items-center gap-2.5">
        <motion.span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            background: style.text,
            boxShadow: `0 0 8px ${style.glow}`,
          }}
          animate={{
            scale: connected ? [1, 1.4, 1] : 1,
            opacity: connected ? [0.6, 1, 0.6] : 0.5,
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        {status}
      </span>
    </motion.div>
  );
}

function GameApp({ wsId }: { wsId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [textChatOpen, setTextChatOpen] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const transcriptRef = useRef('');

  const { client, connected, volume, onToolCall, sendToolResponse } =
    useLiveAPIContext();
  const { isUserSpeaking } = useAudioRecorder();

  // Visualization store
  const {
    addVisualization,
    setCenterVisualization,
    dismissVisualization,
    dismissCenterVisualization,
    dismissAllVisualizations,
  } = useVisualizationStore();

  // Execute a tool call via the API
  const executeToolCall = useCallback(
    async (functionName: string, args: Record<string, unknown>) => {
      try {
        const response = await fetch('/api/v1/live/tools/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wsId, functionName, args }),
        });

        if (!response.ok) {
          const error = await response.json();
          return { error: error.error || 'Tool execution failed' };
        }

        const data = await response.json();
        return data.result;
      } catch (error) {
        console.error('Tool execution error:', error);
        return { error: 'Failed to execute tool' };
      }
    },
    [wsId]
  );

  // Handle tool calls from Gemini
  const handleToolCall = useCallback(
    async (toolCall: ToolCall) => {
      console.log(
        '[Assistant] Tool call received:',
        JSON.stringify(toolCall, null, 2)
      );

      const functionResponses = await Promise.all(
        toolCall.functionCalls.map(async (fc) => {
          console.log(`[Assistant] Executing tool: ${fc.name}`, fc.args);

          // Handle highlight_core_topic tool locally (no API call needed)
          if (fc.name === 'highlight_core_topic') {
            const args = fc.args as {
              title: string;
              content: string;
              emphasis?: 'info' | 'warning' | 'success' | 'highlight';
            };

            // Set center visualization (replaces previous)
            const visData: Omit<
              CoreMentionVisualization,
              'id' | 'createdAt' | 'dismissed' | 'side'
            > = {
              type: 'core_mention',
              data: {
                title: args.title,
                content: args.content,
                emphasis: args.emphasis || 'highlight',
              },
            };
            setCenterVisualization(visData);
            console.log('[Assistant] Set core mention visualization');

            return {
              id: fc.id,
              name: fc.name,
              response: {
                success: true,
                message: 'Core topic highlighted on screen',
              },
            };
          }

          // Handle dismiss_core_mention tool locally
          if (fc.name === 'dismiss_core_mention') {
            dismissCenterVisualization();
            console.log('[Assistant] Dismissed core mention visualization');

            return {
              id: fc.id,
              name: fc.name,
              response: { success: true, message: 'Core mention dismissed' },
            };
          }

          // Execute other tools via API
          const result = await executeToolCall(
            fc.name,
            fc.args as Record<string, unknown>
          );
          console.log(`[Assistant] Tool result:`, result);

          // Handle visualization actions from backend
          const visResult = result as VisualizationToolResponse | undefined;
          if (visResult?.action) {
            if (visResult.action === 'dismiss_visualization') {
              if (visResult.visualizationId === 'all') {
                dismissAllVisualizations();
              } else if (visResult.visualizationId) {
                dismissVisualization(visResult.visualizationId);
              }
            } else if (visResult.visualization) {
              // Add visualization to the store
              const visId = addVisualization(visResult.visualization);
              console.log(`[Assistant] Added visualization: ${visId}`);
            }
          }

          // Format response according to Google GenAI SDK requirements
          // Must include id, name, and response object
          // See: https://ai.google.dev/gemini-api/docs/live-tools
          // The response should contain the data directly, not nested
          return {
            id: fc.id,
            name: fc.name,
            response: result,
          };
        })
      );

      // Send tool responses back to Gemini
      console.log('[Assistant] Sending tool responses:', functionResponses);
      sendToolResponse({ functionResponses });
    },
    [
      executeToolCall,
      sendToolResponse,
      addVisualization,
      setCenterVisualization,
      dismissVisualization,
      dismissCenterVisualization,
      dismissAllVisualizations,
    ]
  );

  // Register tool call handler
  useEffect(() => {
    console.log('[Assistant] Registering tool call handler');
    const unsubscribe = onToolCall(handleToolCall);
    return () => {
      console.log('[Assistant] Unregistering tool call handler');
      unsubscribe();
    };
  }, [onToolCall, handleToolCall]);

  // Debug: Log all events from client
  useEffect(() => {
    if (!client) return;

    // Listen to multiple event types to debug
    client.on('toolcall', (tc: ToolCall) => {
      console.log('[Assistant] TOOLCALL EVENT:', tc);
    });

    client.on('content', (content: unknown) => {
      console.log('[Assistant] CONTENT EVENT:', content);
    });

    return () => {
      // Cleanup if needed
    };
  }, [client]);

  // Handle grounding metadata for Google Search visualization
  useEffect(() => {
    if (!client) return;

    const handleGroundingMetadata = (metadata: GroundingMetadata) => {
      // Extract search query and sources
      const query = metadata.webSearchQueries?.[0] || 'Web search';
      const results =
        metadata.groundingChunks
          ?.filter((chunk) => chunk.web)
          .map((chunk) => ({
            title: chunk.web!.title,
            url: chunk.web!.uri,
          })) || [];

      if (results.length > 0) {
        // Add Google Search visualization
        const visData: Omit<
          GoogleSearchVisualization,
          'id' | 'createdAt' | 'dismissed' | 'side'
        > = {
          type: 'google_search',
          data: {
            query,
            results,
            totalResults: results.length,
          },
        };
        const visId = addVisualization(visData);
        console.log(`[Assistant] Added Google Search visualization: ${visId}`);
      }
    };

    client.on('groundingmetadata', handleGroundingMetadata);
    return () => {
      client.off('groundingmetadata', handleGroundingMetadata);
    };
  }, [client, addVisualization]);

  // Keep transcript ref in sync
  useEffect(() => {
    transcriptRef.current = currentTranscript;
  }, [currentTranscript]);

  // Handle transcription from voice (native audio model) or text content (standard model)
  useEffect(() => {
    if (!client) return;

    const handleTranscription = (text: string) => {
      if (text) {
        setCurrentTranscript((prev) => prev + text);
        setIsSpeaking(true);
      }
    };

    // For standard models, text comes through content event
    const handleContent = (content: ServerContent) => {
      if (isModelTurn(content)) {
        const text = content.modelTurn.parts
          .filter((p) => 'text' in p && p.text)
          .map((p) => ('text' in p ? p.text : ''))
          .join('');
        if (text) {
          setCurrentTranscript((prev) => prev + text);
          setIsSpeaking(true);
        }
      }
    };

    // Detect audio output for speaking state
    const handleAudio = () => {
      setIsSpeaking(true);
    };

    const handleTurnComplete = () => {
      setCurrentTranscript('');
      setIsSpeaking(false);
    };

    // Listen to both transcription (native audio) and content (standard model)
    client.on('transcription', handleTranscription);
    client.on('content', handleContent);
    client.on('audio', handleAudio);
    client.on('turncomplete', handleTurnComplete);

    return () => {
      client.off('transcription', handleTranscription);
      client.off('content', handleContent);
      client.off('audio', handleAudio);
      client.off('turncomplete', handleTurnComplete);
    };
  }, [client]);

  return (
    <div className="-m-4 relative flex h-screen min-h-screen flex-col overflow-hidden">
      {/* Beautiful gradient mesh background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Base gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg,
              hsl(270 50% 5%) 0%,
              hsl(260 40% 8%) 50%,
              hsl(250 35% 6%) 100%)`,
          }}
        />

        {/* Animated gradient orbs in background */}
        <motion.div
          className="absolute top-[15%] left-[10%] h-[700px] w-[700px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${AURORA_COLORS.purple}40 0%, ${AURORA_COLORS.violet}20 40%, transparent 70%)`,
            filter: 'blur(100px)',
          }}
          animate={{
            x: [0, 80, 0, -40, 0],
            y: [0, -60, 0, 50, 0],
            scale: [1, 1.15, 1, 0.9, 1],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
        <motion.div
          className="absolute top-[20%] right-[5%] h-[600px] w-[600px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${AURORA_COLORS.blue}35 0%, ${AURORA_COLORS.cyan}15 40%, transparent 70%)`,
            filter: 'blur(100px)',
          }}
          animate={{
            x: [0, -70, 0, 50, 0],
            y: [0, 70, 0, -45, 0],
            scale: [1, 0.85, 1, 1.12, 1],
          }}
          transition={{
            duration: 28,
            repeat: Infinity,
            ease: 'linear',
            delay: 2,
          }}
        />
        <motion.div
          className="absolute bottom-[10%] left-[20%] h-[500px] w-[500px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${AURORA_COLORS.pink}30 0%, ${AURORA_COLORS.rose}15 40%, transparent 70%)`,
            filter: 'blur(100px)',
          }}
          animate={{
            x: [0, 60, 0, -70, 0],
            y: [0, -50, 0, 60, 0],
            scale: [1, 1.2, 1, 0.85, 1],
          }}
          transition={{
            duration: 26,
            repeat: Infinity,
            ease: 'linear',
            delay: 4,
          }}
        />
        <motion.div
          className="absolute right-[15%] bottom-[30%] h-[400px] w-[400px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${AURORA_COLORS.amber}25 0%, ${AURORA_COLORS.rose}10 40%, transparent 70%)`,
            filter: 'blur(80px)',
          }}
          animate={{
            x: [0, -50, 0, 40, 0],
            y: [0, 40, 0, -50, 0],
            scale: [1, 1.1, 1, 0.92, 1],
          }}
          transition={{
            duration: 24,
            repeat: Infinity,
            ease: 'linear',
            delay: 6,
          }}
        />

        {/* Subtle noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Vignette effect */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0,0,0,0.4) 100%)',
          }}
        />
      </div>

      {/* Dynamic UI visualizations */}
      <VisualizationContainer />

      {/* Main content area */}
      <main className="relative z-10 flex h-[calc(100vh-12rem)] flex-1 flex-col items-center justify-center gap-8">
        {/* Greeting text */}
        <AnimatePresence mode="wait">
          {connected && !isUserSpeaking && !isSpeaking && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="absolute top-[15%] text-center"
            >
              <motion.h1
                className="mb-3 bg-linear-to-r from-foreground via-foreground/80 to-foreground bg-clip-text font-semibold text-2xl tracking-tight md:text-3xl"
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                style={{
                  backgroundSize: '200% 200%',
                }}
              >
                How can I help you today?
              </motion.h1>
              <p className="text-foreground/50 text-sm">
                Just start speaking or type a message
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Aurora Blob */}
        <AuroraBlob
          connected={connected}
          isUserSpeaking={isUserSpeaking}
          isSpeaking={isSpeaking}
          volume={volume}
        />

        {/* Status indicator */}
        <div className="absolute bottom-[22%]">
          <StatusPill
            connected={connected}
            isUserSpeaking={isUserSpeaking}
            isSpeaking={isSpeaking}
          />
        </div>
      </main>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 pb-6 md:p-6 md:pb-8">
          <ControlTray
            videoRef={videoRef}
            supportsVideo={false}
            textChatOpen={textChatOpen}
            onToggleChat={() => setTextChatOpen((v) => !v)}
          />
          <AnimatePresence>
            {textChatOpen && connected && (
              <ChatBox
                connected={connected}
                disabled={!connected}
                onSubmit={async (text: string) => {
                  client.send({ text }, true);
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// Loading animation component
function LoadingOrb() {
  return (
    <div className="-m-4 relative flex h-screen min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg,
              hsl(270 50% 5%) 0%,
              hsl(260 40% 8%) 50%,
              hsl(250 35% 6%) 100%)`,
          }}
        />
        <motion.div
          className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-[500px] w-[500px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${AURORA_COLORS.purple}50 0%, ${AURORA_COLORS.blue}30 40%, transparent 70%)`,
            filter: 'blur(80px)',
          }}
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      {/* Loading orb */}
      <motion.div
        className="relative flex h-28 w-28 items-center justify-center"
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${AURORA_COLORS.purple}, ${AURORA_COLORS.blue}, ${AURORA_COLORS.cyan}, ${AURORA_COLORS.pink}, transparent)`,
            filter: 'blur(6px)',
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-2 rounded-full"
          style={{
            background: 'hsl(260 40% 8%)',
          }}
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles
            className="relative h-7 w-7"
            style={{ color: AURORA_COLORS.purple }}
          />
        </motion.div>
      </motion.div>

      <motion.p
        className="mt-8 text-sm"
        style={{ color: 'rgba(255,255,255,0.5)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        Initializing voice assistant...
      </motion.p>
    </div>
  );
}

export default function App() {
  const params = useParams();
  const wsId = params.wsId as string;
  const { token, isLoading, error, refreshToken } = useEphemeralToken();

  if (isLoading) {
    return <LoadingOrb />;
  }

  if (error || !token) {
    return (
      <div className="-m-4 relative flex h-screen min-h-screen flex-col items-center justify-center gap-6 overflow-hidden">
        {/* Background */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg,
                hsl(270 50% 5%) 0%,
                hsl(260 40% 8%) 50%,
                hsl(250 35% 6%) 100%)`,
            }}
          />
          <motion.div
            className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-[400px] w-[400px] rounded-full"
            style={{
              background: `radial-gradient(circle, ${AURORA_COLORS.rose}40 0%, ${AURORA_COLORS.pink}20 40%, transparent 70%)`,
              filter: 'blur(80px)',
            }}
            animate={{
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </div>

        <motion.div
          className="relative text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className="mb-5 inline-flex h-18 w-18 items-center justify-center rounded-full"
            style={{ background: `${AURORA_COLORS.rose}20` }}
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Sparkles
                className="h-9 w-9"
                style={{ color: AURORA_COLORS.rose }}
              />
            </motion.div>
          </div>
          <h2 className="mb-2 font-semibold text-white text-xl">
            Unable to connect
          </h2>
          <p
            className="mb-6 max-w-xs text-sm"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {error?.message || 'Something went wrong. Please try again.'}
          </p>
          <Button
            onClick={() => refreshToken()}
            className="gap-2"
            style={{
              background: `linear-gradient(135deg, ${AURORA_COLORS.purple}, ${AURORA_COLORS.blue})`,
              border: 'none',
            }}
          >
            <Sparkles className="h-4 w-4" />
            Try again
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <LiveAPIProvider key={token} apiKey={token}>
      <GameApp wsId={wsId} />
    </LiveAPIProvider>
  );
}
