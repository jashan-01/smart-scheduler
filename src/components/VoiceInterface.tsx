"use client";

import { useState, useCallback } from "react";
import type { Status } from "@elevenlabs/react";
import { useElevenLabs } from "@/hooks/useElevenLabs";
import { AudioVisualizer } from "./AudioVisualizer";
import { TranscriptPanel } from "./TranscriptPanel";
import { StatusIndicator } from "./StatusIndicator";


interface VoiceInterfaceProps {
  userEmail: string;
  userName: string;
}

export function VoiceInterface({ userEmail, userName }: VoiceInterfaceProps) {
  const {
    status,
    isSpeaking,
    transcript,
    error,
    startConversation,
    endConversation,
    getInputFrequencyData,
    getOutputFrequencyData,
  } = useElevenLabs();

  const [isStarting, setIsStarting] = useState(false);

  const handleToggle = useCallback(async () => {
    if (status === "connected") {
      await endConversation();
    } else {
      setIsStarting(true);
      try {
        await startConversation({ userEmail, userName });
      } catch (err) {
        console.error("Failed to start:", err);
      } finally {
        setIsStarting(false);
      }
    }
  }, [status, userEmail, userName, startConversation, endConversation]);

  const isConnected = status === "connected";
  const isLoading = status === "connecting" || isStarting;

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <StatusIndicator status={status} isSpeaking={isSpeaking} />
        {error && (
          <span className="text-xs text-red-400 truncate ml-2">{error}</span>
        )}
      </div>

      {/* Transcript */}
      <TranscriptPanel messages={transcript} />

      {/* Audio visualizer */}
      <div className="px-4 py-2 border-t border-zinc-800/50">
        <AudioVisualizer
          getFrequencyData={
            isSpeaking
              ? getOutputFrequencyData
              : getInputFrequencyData
          }
          isActive={isConnected}
          color={isSpeaking ? "#6366f1" : "#22c55e"}
        />
      </div>

      {/* Controls */}
      <div className="px-4 py-4 border-t border-zinc-800 flex items-center justify-center gap-4">
        <button
          onClick={handleToggle}
          disabled={isLoading}
          className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
            isConnected
              ? "bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20"
              : "bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20"
          } ${isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-95"}`}
        >
          {isLoading ? (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isConnected ? (
            // Stop icon
            <svg
              className="w-6 h-6 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          ) : (
            // Microphone icon
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 10v2a7 7 0 0 1-14 0v-2"
              />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}

          {/* Ripple effect when connected */}
          {isConnected && !isSpeaking && (
            <span className="absolute inset-0 rounded-full border-2 border-green-400 animate-ping opacity-20" />
          )}
        </button>

        <div className="text-xs text-zinc-500 w-24">
          {isConnected
            ? "Tap to end"
            : "Tap to start"}
        </div>
      </div>
    </div>
  );
}
