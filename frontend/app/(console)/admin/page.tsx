"use client";

import React from "react";
import { Sliders, Power, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";

export default function CameraSettingsAdminPage() {
  const {
    cameras,
    toggleCameraActive,
    setCameraSensitivity,
    soundMuted,
    toggleSound,
    resetData,
  } = useIBVAPStore();

  return (
    <div className="space-y-6 font-mono">
      {/* Top Banner */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0284C7] text-white flex items-center justify-center font-bold">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              CAMERA SETTINGS // SENSOR_POWER_CONTROL
            </h1>
            <p className="text-[11px] text-[#475569] mt-0.5 font-sans">
              Camera power control, sensitivity thresholds, and audio telemetry configuration.
            </p>
          </div>
        </div>

        {/* Sound Toggle & Reset */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className="px-3.5 py-2 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] rounded-none text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
          >
            {soundMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-[#DC2626]" />
                <span className="text-[#DC2626]">UNMUTE AUDIO</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-[#0284C7]" />
                <span>AUDIO ACTIVE</span>
              </>
            )}
          </button>

          <button
            onClick={resetData}
            className="px-3.5 py-2 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#475569] hover:text-[#0F172A] border border-[#CBDCEB] rounded-none text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
            title="Clear server records"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET CACHE</span>
          </button>
        </div>
      </div>

      {/* Simplified Camera Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cameras.map((cam) => {
          const isOnline = cam.status === "online";

          return (
            <div
              key={cam.id}
              className="p-5 bg-[#FFFFFF] border border-[#CBDCEB] rounded-none flex flex-col justify-between space-y-4 shadow-sm"
            >
              {/* Header: Camera ID & Power Switch */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#0F172A]">{cam.id}</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-[#E0F2FE] text-[#0369A1] rounded-none border border-[#BAE6FD] uppercase font-bold">
                      {cam.type}
                    </span>
                  </div>
                  <h4 className="text-xs text-[#475569] font-bold mt-1">{cam.name}</h4>
                  <p className="text-[11px] text-[#64748B]">{cam.sector}</p>
                </div>

                {/* Big Power On/Off Toggle Button */}
                <button
                  onClick={() => toggleCameraActive(cam.id)}
                  className={`px-4 py-2 rounded-none border text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors shadow-sm ${
                    isOnline
                      ? "bg-[#0284C7] text-white border-[#0284C7] hover:bg-[#0369A1]"
                      : "bg-[#F1F5F9] text-[#64748B] border-[#CBDCEB] hover:text-[#0F172A]"
                  }`}
                >
                  <Power
                    className={`w-3.5 h-3.5 ${isOnline ? "text-white" : "text-[#64748B]"}`}
                  />
                  <span>{isOnline ? "ONLINE" : "OFFLINE"}</span>
                </button>
              </div>

              {/* Sensitivity Slider */}
              <div className="p-3.5 bg-[#F0F6FC] border border-[#CBDCEB] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#475569] font-bold uppercase tracking-widest">
                    DETECTION_SENSITIVITY:
                  </span>
                  <span className="text-[#0284C7] font-bold text-sm">
                    {cam.confidenceThreshold}%
                  </span>
                </div>

                <input
                  type="range"
                  min="50"
                  max="98"
                  value={cam.confidenceThreshold}
                  onChange={(e) => setCameraSensitivity(cam.id, Number(e.target.value))}
                  disabled={!isOnline}
                  className="w-full h-2 accent-[#0284C7] cursor-pointer disabled:opacity-30"
                />

                <div className="flex justify-between text-[10px] text-[#64748B]">
                  <span>Lower (High Recall)</span>
                  <span>Higher (High Precision)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
