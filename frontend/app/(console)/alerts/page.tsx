"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertTriangle,
  Phone,
} from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { Alert } from "@/lib/types";
import { StatusPill } from "@/components/shared/StatusPill";
import { Modal } from "@/components/shared/Modal";
import { formatTimeIST, formatDateIST } from "@/lib/utils";
import { tacticalSound } from "@/lib/sound";
import { BlockchainEvidenceCard } from "@/components/blockchain/BlockchainEvidenceCard";

export default function AlertsPage() {
  const { alerts, guards, acknowledgeAlert, escalateAlert } = useIBVAPStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "PERIMETER" | "POI" | "ANPR" | "OPEN">("ALL");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  const filteredAlerts = alerts.filter((a) => {
    const matchSearch =
      a.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.sourceCameraId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.sector.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase());

    const isPoi = a.eventType.includes("POI") || a.eventType.includes("Facial");
    const isAnpr = a.eventType.includes("ANPR") || a.objectClass === "Vehicle";
    const isPerimeter = a.objectClass === "Person" || a.objectClass === "Weapon" || a.objectClass === "Drone";

    let matchCategory = true;
    if (categoryFilter === "OPEN") matchCategory = a.status === "open";
    else if (categoryFilter === "POI") matchCategory = isPoi;
    else if (categoryFilter === "ANPR") matchCategory = isAnpr;
    else if (categoryFilter === "PERIMETER") matchCategory = isPerimeter && !isPoi;

    return matchSearch && matchCategory;
  });

  const activeNodeAlert = selectedAlert || filteredAlerts[0] || null;
  const linkedGuard = activeNodeAlert
    ? guards.find((g) => g.currentSector === activeNodeAlert.sector)
    : null;

  return (
    <div className="space-y-6 font-mono">
      {/* Header Banner */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#DC2626] text-white flex items-center justify-center font-bold">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              EVIDENCE VAULT // INCIDENT_DOSSIER
            </h1>
            <p className="text-[11px] text-[#475569] mt-0.5 font-sans">
              Cryptographic threat registry, POI face recognition, and ANPR vehicle matching.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#991B1B] font-bold bg-[#FEE2E2] px-3 py-1 border border-[#FCA5A5]">
            {alerts.filter((a) => a.status === "open").length} UNRESOLVED_INCIDENTS
          </span>
        </div>
      </div>

      {/* Query Parameters / Search Interface */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] p-4 space-y-3 shadow-sm">
        <div className="text-[10px] text-[#475569] uppercase tracking-widest font-bold">
          QUERY_PARAMETERS & FILTERS
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "ALL", label: `ALL (${alerts.length})` },
            { key: "OPEN", label: `OPEN ONLY (${alerts.filter((a) => a.status === "open").length})` },
            { key: "PERIMETER", label: "PERIMETER & INTRUSION" },
            { key: "POI", label: "POI & FACE MATCHES" },
            { key: "ANPR", label: "VEHICLES & ANPR" },
          ].map((chip) => (
            <button
              key={chip.key}
              onClick={() => {
                tacticalSound.playClick();
                setCategoryFilter(chip.key as any);
              }}
              className={`px-3.5 py-1.5 rounded-none border text-xs font-bold uppercase tracking-wider transition-colors ${
                categoryFilter === chip.key
                  ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                  : "bg-[#F0F6FC] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative pt-1">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by incident ID, suspect, plate number, or sector..."
            className="w-full bg-[#F8FAFC] border border-[#CBDCEB] rounded-none py-2.5 pl-9 pr-3 text-xs text-[#0F172A] placeholder:text-[#64748B] focus:border-[#0284C7] font-mono"
          />
        </div>
      </div>

      {/* Active Evidence Node Inspector */}
      {activeNodeAlert && (
        <section className="border border-[#CBDCEB] bg-[#FFFFFF] shadow-sm">
          <div className="px-4 py-2.5 bg-[#F0F6FC] border-b border-[#CBDCEB] flex items-center justify-between">
            <span className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              ACTIVE_EVIDENCE_NODE: {activeNodeAlert.id}
            </span>
            <div className="flex items-center gap-2">
              <StatusPill type={activeNodeAlert.level} size="sm" />
              <StatusPill type={activeNodeAlert.status} size="sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#CBDCEB]">
            {/* Image Panel - Full Natural Color */}
            <div className="lg:col-span-8 bg-[#0B1320] relative aspect-video flex items-center justify-center overflow-hidden">
              <img
                src={activeNodeAlert.evidenceUrl}
                alt="Surveillance Evidence Still"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
                <span className="bg-[#0284C7] text-white font-mono text-[10px] px-2 py-0.5 uppercase font-bold tracking-widest shadow-sm">
                  VERIFIED_CAPTURE
                </span>
                <span className="font-mono text-[10px] text-white bg-[#0F172A]/90 px-2 py-0.5 border border-[#38BDF8]/40">
                  {activeNodeAlert.sourceCameraId} // {activeNodeAlert.sector}
                </span>
              </div>
              <div className="absolute bottom-3 right-3 z-10 text-right font-mono text-[10px] text-white bg-[#0F172A]/85 p-2 border border-[#38BDF8]/30">
                <div>REC: {formatDateIST(activeNodeAlert.timestamp)} {formatTimeIST(activeNodeAlert.timestamp)}</div>
                <div className="text-[#38BDF8] font-bold">CONFIDENCE: {activeNodeAlert.confidence}%</div>
              </div>
            </div>

            {/* Data & Actions Panel */}
            <div className="lg:col-span-4 bg-[#FFFFFF] p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="border-b border-[#CBDCEB] pb-2">
                  <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-0.5 font-bold">EVENT_TYPE</div>
                  <div className="text-sm font-bold text-[#0F172A]">{activeNodeAlert.eventType}</div>
                </div>

                <div className="border-b border-[#CBDCEB] pb-2">
                  <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-0.5 font-bold">SECTOR_CLASSIFICATION</div>
                  <div className="text-xs text-[#475569] font-bold">{activeNodeAlert.sector} // {activeNodeAlert.objectClass}</div>
                </div>

                <div className="border-b border-[#CBDCEB] pb-2">
                  <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-0.5 font-bold">OPERATOR_LOG</div>
                  <p className="text-xs text-[#475569] font-sans leading-relaxed">{activeNodeAlert.notes}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-[#CBDCEB] space-y-2">
                {activeNodeAlert.status === "open" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => acknowledgeAlert(activeNodeAlert.id)}
                      className="py-2.5 px-3 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ACKNOWLEDGE</span>
                    </button>
                    <button
                      onClick={() => escalateAlert(activeNodeAlert.id)}
                      className="py-2.5 px-3 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      <span>ESCALATE (QRF)</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-[#166534] p-2 bg-[#DCFCE7] border border-[#86EFAC] font-bold">
                    RESOLVED BY: <strong>{activeNodeAlert.acknowledgedBy}</strong>
                  </div>
                )}

                <button
                  onClick={() => setSelectedAlert(activeNodeAlert)}
                  className="w-full py-2 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  EXPAND FULL CRYPTO DOSSIER →
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Incident List */}
      <div className="space-y-2">
        <div className="text-[10px] text-[#475569] uppercase tracking-widest font-bold">
          INCIDENT_RECORDS_INDEX ({filteredAlerts.length})
        </div>

        <div className="divide-y divide-[#CBDCEB] border border-[#CBDCEB] bg-[#FFFFFF] shadow-sm">
          {filteredAlerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No incident alerts match filter criteria.
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const isSelected = alert.id === activeNodeAlert?.id;
              const isOpen = alert.status === "open";

              return (
                <div
                  key={alert.id}
                  onClick={() => {
                    tacticalSound.playClick();
                    setSelectedAlert(alert);
                  }}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? "bg-[#E0F2FE]" : "hover:bg-[#F8FBFE]"
                  }`}
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="relative w-16 h-12 bg-[#0B1320] border border-[#CBDCEB] shrink-0 overflow-hidden">
                      <img src={alert.evidenceUrl} alt="Still" className="w-full h-full object-cover" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusPill type={alert.level} size="sm" />
                        <span className="text-xs font-bold text-[#0F172A]">{alert.id}</span>
                        <span className="text-[10px] text-[#64748B]">{formatTimeIST(alert.timestamp)}</span>
                      </div>
                      <h4 className="text-xs font-bold text-[#0F172A] truncate mt-0.5">
                        {alert.eventType}
                      </h4>
                      <p className="text-[11px] text-[#475569] font-sans truncate mt-0.5">
                        {alert.notes}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right text-[10px] text-[#64748B] hidden sm:block">
                      <div>Cam: <strong className="text-[#0F172A]">{alert.sourceCameraId}</strong></div>
                      <div>Sec: <strong className="text-[#0F172A]">{alert.sector}</strong></div>
                    </div>

                    {isOpen ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          acknowledgeAlert(alert.id);
                        }}
                        className="px-3 py-1.5 bg-[#0284C7] text-white font-bold text-[10px] uppercase tracking-wider hover:bg-[#0369A1] shadow-sm"
                      >
                        ACK
                      </button>
                    ) : (
                      <StatusPill type={alert.status} size="sm" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Incident Dossier Full Modal */}
      {selectedAlert && (
        <Modal
          isOpen={Boolean(selectedAlert)}
          onClose={() => setSelectedAlert(null)}
          title={`INCIDENT_DOSSIER // ${selectedAlert.id}`}
          subtitle={`${selectedAlert.sector} • ${formatDateIST(selectedAlert.timestamp)} ${formatTimeIST(selectedAlert.timestamp)}`}
          maxWidth="3xl"
        >
          <div className="space-y-4 font-mono text-xs text-[#0F172A]">
            <div className="flex items-center justify-between border-b border-[#CBDCEB] pb-2">
              <div className="flex items-center gap-2">
                <StatusPill type={selectedAlert.level} size="md" />
                <StatusPill type={selectedAlert.status} size="md" />
              </div>
              <span className="text-[#0284C7] font-bold">
                AI_CONFIDENCE: {selectedAlert.confidence}%
              </span>
            </div>

            <div className="relative aspect-video bg-[#0B1320] border border-[#CBDCEB] overflow-hidden">
              <img
                src={selectedAlert.evidenceUrl}
                alt="High-Res Evidence"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 text-[10px] bg-[#0F172A]/90 border border-[#38BDF8]/40 px-2 py-0.5 text-white">
                SOURCE: {selectedAlert.sourceCameraId}
              </div>
            </div>

            <div className="p-3 bg-[#F0F6FC] border border-[#CBDCEB] space-y-1">
              <h4 className="font-bold text-[#0F172A] text-sm uppercase">{selectedAlert.eventType}</h4>
              <p className="text-[#475569] font-sans text-xs leading-relaxed">{selectedAlert.notes}</p>
            </div>

            <BlockchainEvidenceCard alert={selectedAlert} />

            {linkedGuard && (
              <div className="p-3 bg-[#F0F6FC] border border-[#CBDCEB] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                    ASSIGNED SENTRY (SECTOR {selectedAlert.sector}):
                  </span>
                  <span className="font-bold text-[#0F172A]">{linkedGuard.name} ({linkedGuard.callSign})</span>
                </div>
                <a
                  href={`tel:${linkedGuard.phone.replace(/\s+/g, "")}`}
                  className="px-3 py-1.5 bg-[#0284C7] text-white font-bold text-xs flex items-center gap-1.5 uppercase tracking-wider hover:bg-[#0369A1] shadow-sm"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>CALL SENTRY</span>
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
