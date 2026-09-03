"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Volume2,
  VolumeX,
  Clock,
  LogOut,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { formatTimeIST } from "@/lib/utils";
import { tacticalSound } from "@/lib/sound";
import { TacticalButton } from "../shared/TacticalButton";
import { AuthSession, clearAuthSession, getAuthSession } from "@/lib/auth";

export const ConsoleHeader: React.FC = () => {
  const {
    lockdownActive,
    triggerLockdown,
    defconLevel,
    soundMuted,
    toggleSound,
    offlineQueue,
    offlineLogQueue,
    currentUser,
    blockchainStatus,
  } = useIBVAPStore();

  const [currentTime, setCurrentTime] = useState<string>("");
  const [utcTime, setUtcTime] = useState<string>("");
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const totalQueued = offlineQueue.length + offlineLogQueue.length;

  useEffect(() => {
    const updateTimes = () => {
      setCurrentTime(formatTimeIST());
      const now = new Date();
      setUtcTime(now.toISOString().substring(11, 19) + " UTC");
    };
    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setAuthSession(getAuthSession());
  }, []);

  const handleSignOut = () => {
    tacticalSound.playClick();
    clearAuthSession();
    window.location.href = "/login";
  };

  return (
    <header className="h-14 bg-[#FFFFFF] border-b border-[#CBDCEB] px-4 flex items-center justify-between z-30 shrink-0 select-none font-mono shadow-sm">
      {/* Left: Terminal Node & Clock */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#0284C7] animate-pulse" />
          <span className="text-xs font-bold text-[#0F172A] tracking-widest uppercase">
            S_COMMAND_01
          </span>
        </div>

        <span className="text-[#CBDCEB] hidden sm:inline">|</span>

        {/* DEFCON Level */}
        <div
          className={`text-[11px] px-2.5 py-1 border font-bold uppercase tracking-wider ${
            defconLevel === 1
              ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5] animate-pulse"
              : defconLevel === 2
              ? "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]"
              : "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]"
          }`}
        >
          DEFCON_{defconLevel}
        </div>

        {/* Live Clock (UTC & IST) */}
        <div className="hidden md:flex items-center gap-2 text-xs text-[#475569]">
          <Clock className="w-3.5 h-3.5 text-[#0284C7]" />
          <span className="text-[#0F172A] font-bold">{utcTime || "00:00:00 UTC"}</span>
          <span className="text-[10px] text-[#64748B]">({currentTime || "00:00:00"} IST)</span>
        </div>
      </div>

      {/* Quick Center Nav for Desktop */}
      <nav className="hidden xl:flex items-center gap-6 text-[11px] uppercase tracking-widest text-[#475569]">
        <Link href="/live-feed" className="hover:text-[#0284C7] transition-colors">LIVE_FEED</Link>
        <Link href="/alerts" className="hover:text-[#0284C7] transition-colors">EVIDENCE_VAULT</Link>
        <Link href="/map" className="hover:text-[#0284C7] transition-colors">RADAR_GIS</Link>
        <Link href="/guard-duty" className="hover:text-[#0284C7] transition-colors">ROSTER</Link>
      </nav>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {authSession && (
          <div className="hidden lg:block border border-[#CBDCEB] bg-[#F0F6FC] px-2.5 py-1 text-[10px] uppercase">
            <span className="text-[#64748B]">{authSession.rank} // </span>
            <span className="font-bold text-[#0369A1]">{authSession.operatorId}</span>
          </div>
        )}

        {/* Blockchain Status */}
        <div
          title={blockchainStatus.message}
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 border text-[10px] font-bold uppercase ${
            blockchainStatus.connected
              ? "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]"
              : "bg-[#F1F5F9] text-[#64748B] border-[#CBDCEB]"
          }`}
        >
          <ShieldCheck className="w-3 h-3 text-[#16A34A]" />
          <span>LEDGER: {blockchainStatus.connected ? "SYNC" : "STANDBY"}</span>
        </div>

        {/* Offline Queue Badge */}
        {totalQueued > 0 && (
          <div
            className="flex items-center gap-1.5 px-2 py-1 bg-[#FEF3C7] border border-[#FCD34D] text-[#92400E] text-[10px] font-bold uppercase"
            title={`${totalQueued} items buffered offline`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />
            <span>BUFFER ({totalQueued})</span>
          </div>
        )}

        {/* Sound Toggle */}
        <button
          onClick={toggleSound}
          className={`p-2 border rounded-none transition-colors ${
            soundMuted
              ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
              : "bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0369A1] border-[#CBDCEB]"
          }`}
          title={soundMuted ? "Audio muted" : "Audio active"}
        >
          {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {/* Tactical Lockdown Trigger */}
        <TacticalButton
          variant="danger"
          size="sm"
          onClick={() => triggerLockdown()}
          className={lockdownActive ? "animate-pulse" : ""}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
        >
          {lockdownActive ? "LOCKDOWN ACTIVE" : "LOCKDOWN"}
        </TacticalButton>

        {/* Sign Out */}
        <button onClick={handleSignOut} title={`Sign out ${authSession?.operatorId || "operator"}`} className="p-2 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#64748B] hover:text-[#0F172A] border border-[#CBDCEB] transition-colors rounded-none">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
