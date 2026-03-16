"use client";

import { useConversation } from "@elevenlabs/react";
import type { Status } from "@elevenlabs/react";
import { useCallback, useState, useRef } from "react";

export interface TranscriptMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: Date;
}

export function useElevenLabs() {
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messageIdCounter = useRef(0);

  const conversation = useConversation({
    onConnect: () => {
      setError(null);
    },
    onDisconnect: () => {},
    onMessage: (message) => {
      const id = `msg-${++messageIdCounter.current}`;
      const role = message.source === "user" ? "user" : "agent";

      setTranscript((prev) => [
        ...prev,
        {
          id,
          role,
          text: message.message,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (err) => {
      setError(typeof err === "string" ? err : "Connection error occurred");
    },
  });

  const startConversation = useCallback(
    async (overrides?: {
      userEmail?: string;
      userName?: string;
    }) => {
      try {
        setError(null);
        setTranscript([]);

        // Get signed URL from our backend
        const response = await fetch("/api/auth/elevenlabs-token");
        const data = await response.json();

        if (!response.ok || !data.signedUrl) {
          throw new Error(data.error || "Failed to get signed URL");
        }

        const today = new Date();
        const currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        await conversation.startSession({
          signedUrl: data.signedUrl,
          dynamicVariables: {
            user_email: overrides?.userEmail ?? "",
            user_name: overrides?.userName ?? "",
            current_date: currentDate,
          },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to start conversation";
        setError(message);
        throw err;
      }
    },
    [conversation]
  );

  const endConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  return {
    status: conversation.status as Status,
    isSpeaking: conversation.isSpeaking,
    transcript,
    error,
    startConversation,
    endConversation,
    sendMessage: conversation.sendUserMessage,
    getInputFrequencyData: conversation.getInputByteFrequencyData,
    getOutputFrequencyData: conversation.getOutputByteFrequencyData,
  };
}
