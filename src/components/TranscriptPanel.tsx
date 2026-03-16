"use client";

import { useEffect, useRef } from "react";
import type { TranscriptMessage } from "@/hooks/useElevenLabs";

interface TranscriptPanelProps {
  messages: TranscriptMessage[];
}

export function TranscriptPanel({ messages }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
        <p>Start a conversation to see the transcript here.</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 p-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              message.role === "user"
                ? "bg-indigo-600 text-white rounded-br-md"
                : "bg-zinc-800 text-zinc-100 rounded-bl-md"
            }`}
          >
            <p>{message.text}</p>
            <p
              className={`text-[10px] mt-1 ${
                message.role === "user"
                  ? "text-indigo-200"
                  : "text-zinc-500"
              }`}
            >
              {message.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
