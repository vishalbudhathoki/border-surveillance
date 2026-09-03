"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Key, Lock, Radio, Shield } from "lucide-react";
import { TacticalButton } from "@/components/shared/TacticalButton";
import { tacticalSound } from "@/lib/sound";

export default function LoginPage() {
  const router = useRouter();
  const [operatorId, setOperatorId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    tacticalSound.playClick();
    setIsVerifying(true);
    window.setTimeout(() => router.push("/dashboard"), 500);
  };

  return (
    <div className="min-h-screen bg-[#EBF3FA] flex flex-col items-center justify-center p-6 relative font-mono text-[#0F172A]">
      <div className="relative max-w-md w-full bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-8 z-10 shadow-xl">
        <div className="text-center pb-6 border-b border-[#CBDCEB]">
          <div className="w-10 h-10 bg-[#0284C7] text-white flex items-center justify-center mx-auto mb-4 font-bold shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#0F172A]">
            BORDERLENS // CONSOLE_AUTH
          </h2>
          <p className="text-[10px] text-[#0284C7] font-semibold mt-1 tracking-wider">
            RESTRICTED ACCESS // NODE_ALPHA_07
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5 pt-6">
          <div className="relative pt-4">
            <label className="text-[10px] text-[#475569] uppercase tracking-widest font-bold block mb-1">
              OPERATOR_ID
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-[#0284C7] absolute left-0 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={operatorId}
                onChange={(event) => setOperatorId(event.target.value)}
                placeholder="OP_ALPHA_01"
                className="w-full bg-transparent border-0 border-b border-[#CBDCEB] focus:border-[#0284C7] rounded-none py-2 pl-7 pr-2 text-xs text-[#0F172A] placeholder:text-[#94A3B8] font-mono transition-colors font-bold"
                required
              />
            </div>
          </div>

          <div className="relative pt-2">
            <label className="text-[10px] text-[#475569] uppercase tracking-widest font-bold block mb-1">
              SECURITY_PASSCODE / TOKEN
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#0284C7] absolute left-0 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-transparent border-0 border-b border-[#CBDCEB] focus:border-[#0284C7] rounded-none py-2 pl-7 pr-2 text-xs text-[#0F172A] placeholder:text-[#94A3B8] font-mono transition-colors font-bold"
                required
              />
            </div>
          </div>

          <div className="pt-4">
            <TacticalButton
              variant="primary"
              size="lg"
              type="submit"
              loading={isVerifying}
              className="w-full font-bold shadow-sm"
            >
              {isVerifying ? "AUTHENTICATING..." : "VERIFY & ENTER CONSOLE"}
            </TacticalButton>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t border-[#CBDCEB] flex items-center justify-between text-[10px] text-[#64748B]">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-[#16A34A]" />
            <span>SESSION_ENCRYPTED</span>
          </div>
          <Link href="/" className="text-[#0284C7] hover:underline font-bold transition-colors">
            ← PUBLIC PORTAL
          </Link>
        </div>
      </div>
    </div>
  );
}
