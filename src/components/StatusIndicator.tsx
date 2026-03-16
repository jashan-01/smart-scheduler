"use client";

interface StatusIndicatorProps {
  status: "connected" | "connecting" | "disconnected" | "disconnecting";
  isSpeaking: boolean;
}

export function StatusIndicator({ status, isSpeaking }: StatusIndicatorProps) {
  const getStatusConfig = () => {
    if (status === "disconnected") {
      return {
        color: "bg-zinc-500",
        pulse: false,
        text: "Ready to connect",
      };
    }
    if (status === "connecting") {
      return {
        color: "bg-amber-500",
        pulse: true,
        text: "Connecting...",
      };
    }
    if (isSpeaking) {
      return {
        color: "bg-indigo-500",
        pulse: true,
        text: "Agent speaking",
      };
    }
    return {
      color: "bg-green-500",
      pulse: true,
      text: "Listening",
    };
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
        {config.pulse && (
          <div
            className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${config.color} animate-ping opacity-50`}
          />
        )}
      </div>
      <span className="text-xs text-zinc-400">{config.text}</span>
    </div>
  );
}
