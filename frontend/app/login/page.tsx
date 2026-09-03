"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Key, Lock, Radio, Shield } from "lucide-react";
import { TacticalButton } from "@/components/shared/TacticalButton";
import { tacticalSound } from "@/lib/sound";
import { authenticate, saveAuthSession } from "@/lib/auth";
import { ApiError, backendApi } from "@/lib/api/client";

export default function LoginPage() {
  const router = useRouter();
  const [operatorId, setOperatorId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    tacticalSound.playClick();
    setError("");
    setIsVerifying(true);
    try {
      const response = await backendApi.login(operatorId, passcode);
      const session = { ...response.session, token: response.token };
      saveAuthSession(session);
      router.push(session.tier === "admin" ? "/admin" : session.tier === "field" ? "/live-feed" : "/dashboard");
    } catch (loginError) {
      // Keep the UI preview usable when Django is intentionally offline. The
      // backend path above is authoritative whenever the API is reachable.
      if (!(loginError instanceof ApiError)) {
        const localSession = authenticate(operatorId, passcode);
        if (localSession) {
          saveAuthSession(localSession);
          router.push(localSession.tier === "admin" ? "/admin" : localSession.tier === "field" ? "/live-feed" : "/dashboard");
          return;
        }
      }
      setError(
        loginError instanceof ApiError && loginError.status === 503
          ? "AUTHORITY UNAVAILABLE // START THE DJANGO BACKEND"
          : "ACCESS DENIED // CHECK OPERATOR ID AND SECURITY PASSCODE"
      );
      setIsVerifying(false);
    }
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
          {error && (
            <div className="flex items-center gap-2 border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[10px] font-bold text-[#B91C1C]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>

        <div className="mt-6 border border-[#CBDCEB] bg-[#F0F6FC] p-3 text-[10px] text-[#475569]">
          <div className="font-bold uppercase tracking-widest text-[#0369A1]">DEMO ACCESS TIERS</div>
          <div className="mt-2 space-y-1 font-mono">
            <div><strong>ADMIN-001</strong> // administrator</div>
            <div><strong>SSB-2041</strong> // inspector command</div>
            <div><strong>SSB-2098</strong> // rifleman field</div>
          </div>
          <p className="mt-2 text-[9px] text-[#64748B]">Use the configured demo passcodes for this preview. Production should use server-side or Firebase authentication.</p>
        </div>

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
