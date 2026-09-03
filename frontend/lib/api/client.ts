import {
  ActivityLogEntry,
  Alert,
  Camera,
  Guard,
  GuardStatus,
  Sector,
  Shift,
} from "@/lib/types";
import { AuthSession, getAuthSession } from "@/lib/auth";

export interface BlockchainStatus {
  configured: boolean;
  connected: boolean;
  mode: "live" | "not_configured" | "unavailable" | string;
  network: string;
  chainId: number | null;
  contractAddress: string | null;
  explorerBaseUrl: string | null;
  message: string;
}

export interface FirebaseStatus {
  configured: boolean;
  initialized: boolean;
  projectId: string | null;
  message: string;
  alertsSynced?: boolean;
  alertsCount?: number | null;
}

export interface VerificationResult {
  status: "verified" | "mismatch" | "not_configured" | "unavailable" | "not_anchored" | string;
  verified: boolean;
  incidentReferenceHash: string;
  evidenceSha256: string;
  transactionHash: string | null;
  explorerUrl?: string | null;
  message: string;
}

export interface BootstrapData {
  currentUser: {
    name: string;
    rank: string;
    badgeId: string;
    role: string;
  };
  guards: Guard[];
  shifts: Shift[];
  activityLog: ActivityLogEntry[];
  alerts: Alert[];
  cameras: Camera[];
  sectors: Sector[];
  pois?: unknown[];
  anprRecords?: unknown[];
  system: {
    lockdownActive: boolean;
    defconLevel: 1 | 2 | 3 | 4 | 5;
  };
}

export interface BootstrapResponse {
  data: BootstrapData;
  meta: { source: string; generatedAt: string };
  blockchain: BlockchainStatus;
  firebase: FirebaseStatus;
}

export interface CreateGuardPayload {
  id?: string;
  name: string;
  rank: string;
  badgeId: string;
  operatorId?: string;
  passcode: string;
  phone?: string;
  callSign?: string;
  sector?: string;
  postId?: string;
  status?: GuardStatus;
  bloodGroup?: string;
  certifications?: string;
  photoUrl?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  shiftStart?: string;
  shiftEnd?: string;
}

export interface FrameDetection {
  label: string;
  source: "person_tracking" | "face_detection" | "anpr" | string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
  trackId?: string | null;
  attributes?: Record<string, unknown>;
}

export interface FrameInferenceModule {
  id: "person_tracking" | "face_detection" | "anpr" | string;
  label: string;
  model: string;
  status: "active" | "disabled" | "unavailable" | string;
  detectionCount: number;
  message?: string;
}

export interface FrameInferenceResponse {
  status: string;
  model: string;
  device: string;
  confidenceThreshold: number;
  inferenceMs: number;
  frameWidth: number;
  frameHeight: number;
  detections: FrameDetection[];
  modules: FrameInferenceModule[];
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const apiBaseUrl = () =>
  (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const session = getAuthSession();
  if (session?.token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(String(payload.error || `API request failed (${response.status})`), response.status);
  }
  return payload as T;
}

export const backendApi = {
  login: (operatorId: string, passcode: string) =>
    request<{ session: Omit<AuthSession, "token">; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ operatorId, passcode }),
    }),
  getBootstrap: () => request<BootstrapResponse>("/bootstrap"),
  getBlockchainStatus: () => request<BlockchainStatus>("/blockchain/status"),
  getFirebaseStatus: () => request<FirebaseStatus>("/firebase/status"),
  analyzeFrame: (frame: Blob, modules?: string[]) =>
    request<FrameInferenceResponse>(
      `/inference/frame${modules?.length ? `?modules=${encodeURIComponent(modules.join(","))}` : ""}`,
      {
      method: "POST",
      body: frame,
      // Django reads the JPEG directly from the request body. Using a CORS-
      // safelisted content type avoids an OPTIONS preflight before every live
      // frame when Next.js and Django run on different localhost ports.
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      }
    ),
  verifyAlert: (alertId: string) =>
    request<{ verification: VerificationResult }>(`/alerts/${encodeURIComponent(alertId)}/verification`),
  actionAlert: (alertId: string, action: "acknowledge" | "escalate", actorName: string) =>
    request(`/alerts/${encodeURIComponent(alertId)}/action`, {
      method: "POST",
      body: JSON.stringify({ action, actorName }),
    }),
  createAlert: (alert: Alert) =>
    request(`/alerts`, { method: "POST", body: JSON.stringify(alert) }),
  addActivity: (entry: ActivityLogEntry) =>
    request(`/activity`, { method: "POST", body: JSON.stringify(entry) }),
  createGuard: (payload: CreateGuardPayload) =>
    request<{ guard: Guard; accessTier: string }>("/guards", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateGuard: (guardId: string, changes: Partial<Guard>) =>
    request(`/guards/${encodeURIComponent(guardId)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  updateShift: (shiftId: string, changes: Partial<Shift>) =>
    request(`/shifts/${encodeURIComponent(shiftId)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  handover: (payload: { outgoingGuardId: string; incomingGuardId: string; notes?: string }) =>
    request(`/handover`, { method: "POST", body: JSON.stringify(payload) }),
  updateCamera: (cameraId: string, changes: Partial<Camera>) =>
    request(`/cameras/${encodeURIComponent(cameraId)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  systemAction: (action: "lockdown" | "abort_lockdown" | "defcon", level?: number, actorName?: string) =>
    request(`/system/action`, {
      method: "POST",
      body: JSON.stringify({ action, level, actorName }),
    }),
  sync: (alerts: Alert[], activityLog: ActivityLogEntry[]) =>
    request<{ data: BootstrapData; blockchain: BlockchainStatus; firebase: FirebaseStatus }>("/sync", {
      method: "POST",
      body: JSON.stringify({ alerts, activityLog }),
    }),
  reset: () => request<BootstrapResponse>("/reset", { method: "POST" }),
  anchorAlert: (alertId: string) =>
    request<{ alert: Alert; blockchain: Record<string, unknown> }>(
      `/alerts/${encodeURIComponent(alertId)}/anchor`,
      { method: "POST" }
    ),
};
