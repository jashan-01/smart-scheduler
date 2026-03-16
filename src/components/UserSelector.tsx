"use client";

import { useState } from "react";

interface UserSelectorProps {
  users: { email: string; name: string }[];
  selectedUser: string;
  onSelectUser: (email: string) => void;
}

export function UserSelector({
  users,
  selectedUser,
  onSelectUser,
}: UserSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = users.find((u) => u.email === selectedUser);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-sm"
      >
        <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
          {selected?.name.charAt(0).toUpperCase() || "?"}
        </div>
        <span className="text-zinc-200">{selected?.name || "Select user"}</span>
        <svg
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg bg-zinc-800 border border-zinc-700 shadow-xl z-50">
          {users.map((user) => (
            <button
              key={user.email}
              onClick={() => {
                onSelectUser(user.email);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-zinc-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                user.email === selectedUser
                  ? "text-indigo-400"
                  : "text-zinc-300"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                  user.email === selectedUser ? "bg-indigo-600" : "bg-zinc-600"
                }`}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <div className="font-medium">{user.name}</div>
                <div className="text-[10px] text-zinc-500">{user.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
