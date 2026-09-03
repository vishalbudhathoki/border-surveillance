"use client";

import React from "react";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { ConsoleSidebar } from "@/components/console/ConsoleSidebar";
import { LockdownOverlay } from "@/components/console/LockdownOverlay";
import { OfflineSyncBanner } from "@/components/console/OfflineSyncBanner";
import { BackendHydrator } from "@/components/console/BackendHydrator";

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#EBF3FA] text-[#0F172A] font-sans selection:bg-[#0284C7] selection:text-white">
      <BackendHydrator />
      {/* Navigation Sidebar */}
      <ConsoleSidebar />

      {/* Main Command Console Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#EBF3FA]">
        {/* Top Command Header */}
        <ConsoleHeader />

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#EBF3FA] relative">
          <div className="relative z-10 max-w-[1800px] mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Global Modals & Overlays */}
      <LockdownOverlay />
      <OfflineSyncBanner />
    </div>
  );
}
