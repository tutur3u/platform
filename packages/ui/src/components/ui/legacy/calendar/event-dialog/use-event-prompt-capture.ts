'use client';

import { notifySave } from '@tuturuuu/ui/save-notification';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useRef, useState } from 'react';

/**
 * Voice and photo input for the AI prompt: records audio or reads an image,
 * sends it to the calendar transcription endpoints and hands back the text.
 */
export function useEventPromptCapture(onText: (text: string) => void) {
  const toast = notifySave;
  const t = useTranslations('calendar.event_dialog');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revokeMediaPermissions = () => {
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStream.current = null;
    }
  };

  const sendAudioToServer = async (base64Audio: string) => {
    try {
      const response = await fetch('/api/v1/calendar/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Audio }),
      });
      const result = await response.json();
      if (result.text) {
        onText(result.text);
      } else {
        toast({
          title: t('audio_failed_title'),
          description: result.error || t('audio_failed'),
          variant: 'destructive',
        });
      }
    } catch (_) {
      toast({
        title: t('audio_failed_title'),
        description: t('audio_failed'),
        variant: 'destructive',
      });
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const startRecording = async () => {
    setIsRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };
      mediaRecorder.current.onstop = async () => {
        if (audioChunks.current.length === 0) {
          setIsRecording(false);
          setIsProcessingAudio(false);
          return;
        }
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result?.toString().split(',')[1];
          if (!base64Audio) {
            setIsProcessingAudio(false);
            return;
          }
          sendAudioToServer(base64Audio);
        };
        revokeMediaPermissions();
        audioChunks.current = [];
      };
      mediaRecorder.current.start();
    } catch (_) {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsProcessingAudio(true);
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    } else {
      revokeMediaPermissions();
      setIsProcessingAudio(false);
    }
  };

  const pickImage = () => {
    fileInputRef.current?.click();
  };

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64Image = reader.result?.toString().split(',')[1];
      if (!base64Image) {
        setIsProcessingImage(false);
        return;
      }
      try {
        const response = await fetch('/api/v1/calendar/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image }),
        });
        const result = await response.json();
        if (result.text) {
          onText(result.text);
        } else {
          toast({
            title: t('image_failed_title'),
            description: result.error || t('image_failed'),
            variant: 'destructive',
          });
        }
      } catch (_) {
        toast({
          title: t('image_failed_title'),
          description: t('image_failed'),
          variant: 'destructive',
        });
      } finally {
        setIsProcessingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
  };

  return {
    isRecording,
    isProcessingAudio,
    isProcessingImage,
    fileInputRef,
    startRecording,
    stopRecording,
    pickImage,
    handleImageSelected,
  };
}
