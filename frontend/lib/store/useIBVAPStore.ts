import { create } from "zustand";
import {
  Guard,
  Shift,
  ActivityLogEntry,
  Alert,
  Camera,
  Sector,
  GuardStatus,
  Point2D,
} from "../types";
import { tacticalSound } from "../sound";
import { generateId } from "../utils";
import { backendApi, BlockchainStatus, BootstrapData, CreateGuardPayload, FirebaseStatus } from "../api/client";

interface UserProfile {
  name: string;
  rank: string;
  badgeId: string;
  role: string;
}

type BackendStatus = "loading" | "online" | "offline";

const DEFAULT_BLOCKCHAIN_STATUS: BlockchainStatus = {
  configured: false,
  connected: false,
  mode: "not_configured",
  network: "Sepolia testnet",
  chainId: null,
  contractAddress: null,
  explorerBaseUrl: null,
  message: "Backend blockchain configuration is not present.",
};

const DEFAULT_FIREBASE_STATUS: FirebaseStatus = {
  configured: false,
  initialized: false,
  projectId: null,
  message: "Firebase Admin credentials are not configured.",
};

interface IBVAPState {
  guards: Guard[];
  shifts: Shift[];
  activityLog: ActivityLogEntry[];
  alerts: Alert[];
  cameras: Camera[];
  sectors: Sector[];

  offlineQueue: Alert[];
  offlineLogQueue: ActivityLogEntry[];
  lockdownActive: boolean;
  defconLevel: 1 | 2 | 3 | 4 | 5;
  soundMuted: boolean;
  currentUser: UserProfile;
  backendStatus: BackendStatus;
  isHydrated: boolean;
  isHydrating: boolean;
  lastSyncAt: string | null;
  blockchainStatus: BlockchainStatus;
  firebaseStatus: FirebaseStatus;

  hydrateFromBackend: () => Promise<void>;
  toggleSound: () => void;
  setDefconLevel: (level: 1 | 2 | 3 | 4 | 5) => void;
  triggerLockdown: () => void;
  abortLockdown: () => void;
  flushOfflineQueue: () => void;

  acknowledgeAlert: (alertId: string, actorName?: string) => void;
  escalateAlert: (alertId: string, actorName?: string) => void;
  addAlert: (alert: Omit<Alert, "id" | "timestamp" | "status" | "acknowledgedBy">) => void;
  addGuard: (payload: CreateGuardPayload) => Promise<Guard>;

  updateGuardStatus: (guardId: string, status: GuardStatus) => void;
  quickHandover: (outgoingGuardId: string, incomingGuardId: string, notes?: string) => void;
  performShiftHandover: (
    postId: string,
    outgoingGuardId: string,
    incomingGuardId: string,
    notes: string,
    actorName?: string
  ) => void;
  reassignShift: (shiftId: string, newGuardId: string, newGuardName: string) => void;

  toggleCameraActive: (cameraId: string) => void;
  setCameraSensitivity: (cameraId: string, threshold: number) => void;
  updateCameraDetection: (cameraId: string, updates: Partial<Camera>) => void;
  commitZoneMap: (cameraId: string, polygon: Point2D[], actorName?: string) => void;

  addActivityLog: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => void;
  resetData: () => void;
}

const makeActivity = (
  entry: Omit<ActivityLogEntry, "id" | "timestamp">
): ActivityLogEntry => ({
  ...entry,
  id: generateId("LOG"),
  timestamp: new Date().toISOString(),
});

const applyBackendData = (
  data: BootstrapData,
  blockchainStatus: BlockchainStatus,
  firebaseStatus: FirebaseStatus
) => ({
  guards: data.guards,
  shifts: data.shifts,
  activityLog: data.activityLog,
  alerts: data.alerts,
  cameras: data.cameras,
  sectors: data.sectors,
  currentUser: data.currentUser,
  lockdownActive: data.system.lockdownActive,
  defconLevel: data.system.defconLevel,
  blockchainStatus,
  firebaseStatus,
});

export const useIBVAPStore = create<IBVAPState>((set, get) => {
  const setBackendOffline = () => set({ backendStatus: "offline" });

  const refreshAfter = (request: Promise<unknown>) => {
    void request
      .then(() => get().hydrateFromBackend())
      .catch(() => setBackendOffline());
  };

  const addLocalActivity = (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => {
    const activity = makeActivity(entry);
    if (get().backendStatus === "offline") {
      set((state) => ({ offlineLogQueue: [activity, ...state.offlineLogQueue] }));
    } else {
      set((state) => ({ activityLog: [activity, ...state.activityLog] }));
    }
    return activity;
  };

  return {
    guards: [],
    shifts: [],
    activityLog: [],
    alerts: [],
    cameras: [],
    sectors: [],

    offlineQueue: [],
    offlineLogQueue: [],
    lockdownActive: false,
    defconLevel: 2,
    soundMuted: false,
    currentUser: {
      name: "Local operator",
      rank: "Operator",
      badgeId: "LOCAL-OPERATOR",
      role: "Local command console",
    },
    backendStatus: "loading",
    isHydrated: false,
    isHydrating: false,
    lastSyncAt: null,
    blockchainStatus: DEFAULT_BLOCKCHAIN_STATUS,
    firebaseStatus: DEFAULT_FIREBASE_STATUS,

    hydrateFromBackend: async () => {
      if (get().isHydrating) return;
      set({ isHydrating: true });
      try {
        const response = await backendApi.getBootstrap();
        set({
          ...applyBackendData(response.data, response.blockchain, response.firebase),
          backendStatus: "online",
          isHydrated: true,
          lastSyncAt: response.meta.generatedAt,
        });
      } catch {
        set({
          backendStatus: "offline",
          isHydrated: true,
          guards: [],
          shifts: [],
          activityLog: [],
          alerts: [],
          cameras: [],
          sectors: [],
        });
      } finally {
        set({ isHydrating: false });
      }
    },

    toggleSound: () => {
      const next = !get().soundMuted;
      tacticalSound.setMuted(next);
      set({ soundMuted: next });
    },

    setDefconLevel: (level) => {
      tacticalSound.playWarning();
      set({ defconLevel: level, lockdownActive: level === 1 });
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "lockdown_initiated",
        targetType: "system",
        targetId: `DEFCON-${level}`,
        sector: "All Sectors",
        details: `Alert state changed to DEFCON ${level}. Automated perimeter protocols activated.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.systemAction("defcon", level, get().currentUser.name));
      }
    },

    triggerLockdown: () => {
      tacticalSound.playLockdown();
      set({ lockdownActive: true, defconLevel: 1 });
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "lockdown_initiated",
        targetType: "system",
        targetId: "LOCKDOWN-GLOBAL",
        sector: "All Sectors",
        details: "Global perimeter lockdown initiated. QRF units mobilized.",
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.systemAction("lockdown", undefined, get().currentUser.name));
      }
    },

    abortLockdown: () => {
      tacticalSound.playClick();
      set({ lockdownActive: false, defconLevel: 2 });
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "lockdown_initiated",
        targetType: "system",
        targetId: "LOCKDOWN-ABORT",
        sector: "All Sectors",
        details: "Perimeter lockdown stand-down confirmed. Standard protocols restored.",
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.systemAction("abort_lockdown", undefined, get().currentUser.name));
      }
    },

    flushOfflineQueue: () => {
      const alerts = get().offlineQueue;
      const activityLog = get().offlineLogQueue;
      const count = alerts.length + activityLog.length;
      if (count === 0) return;
      tacticalSound.playAlert();
      void backendApi
        .sync(alerts, activityLog)
        .then((response) => {
          set({
            ...applyBackendData(response.data, response.blockchain, response.firebase),
            offlineQueue: [],
            offlineLogQueue: [],
            backendStatus: "online",
            lastSyncAt: new Date().toISOString(),
          });
        })
        .catch(() => setBackendOffline());
    },

    acknowledgeAlert: (alertId, actorName) => {
      tacticalSound.playClick();
      const actor = actorName || get().currentUser.name;
      const target = get().alerts.find((alert) => alert.id === alertId);
      if (!target) return;
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? { ...alert, status: "acknowledged", acknowledgedBy: actor }
            : alert
        ),
      }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: actor,
        actionType: "alert_acknowledged",
        targetType: "alert",
        targetId: alertId,
        sector: target.sector,
        details: `Acknowledged alert ${alertId}: ${target.eventType}.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.actionAlert(alertId, "acknowledge", actor));
      }
    },

    escalateAlert: (alertId, actorName) => {
      tacticalSound.playAlert();
      const actor = actorName || get().currentUser.name;
      const target = get().alerts.find((alert) => alert.id === alertId);
      if (!target) return;
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? { ...alert, status: "escalated", acknowledgedBy: actor }
            : alert
        ),
      }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: actor,
        actionType: "alert_escalated",
        targetType: "alert",
        targetId: alertId,
        sector: target.sector,
        details: `Escalated alert ${alertId} (${target.eventType}) to QRF.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.actionAlert(alertId, "escalate", actor));
      }
    },

    addAlert: (alertData) => {
      const newAlert: Alert = {
        ...alertData,
        id: generateId("ALT-2026"),
        timestamp: new Date().toISOString(),
        status: "open",
        acknowledgedBy: null,
      };
      tacticalSound.playAlert();
      if (get().backendStatus === "offline") {
        set((state) => ({ offlineQueue: [newAlert, ...state.offlineQueue] }));
        return;
      }
      set((state) => ({ alerts: [newAlert, ...state.alerts] }));
      addLocalActivity({
        actorId: "AI-VISION-CORE",
        actorName: "AI Detection Engine",
        actionType: "patrol_checkin",
        targetType: "alert",
        targetId: newAlert.id,
        sector: newAlert.sector,
        details: `Detected ${newAlert.level.toUpperCase()}: ${newAlert.eventType}. Confidence: ${newAlert.confidence}%.`,
      });
      refreshAfter(backendApi.createAlert(newAlert));
    },

    addGuard: async (payload) => {
      const response = await backendApi.createGuard(payload);
      set((state) => ({ guards: [response.guard, ...state.guards] }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "guard_created",
        targetType: "system",
        targetId: response.guard.id,
        sector: response.guard.currentSector || "All Sectors",
        details: `Created ${response.guard.rank} guard ${response.guard.name} with ${response.accessTier} access.`,
      });
      return response.guard;
    },

    updateGuardStatus: (guardId, status) => {
      tacticalSound.playClick();
      const guard = get().guards.find((item) => item.id === guardId);
      if (!guard) return;
      set((state) => ({
        guards: state.guards.map((item) => (item.id === guardId ? { ...item, status } : item)),
      }));
      addLocalActivity({
        actorId: guardId,
        actorName: guard.name,
        actionType: status === "patrolling" ? "patrol_checkin" : "shift_started",
        targetType: "post",
        targetId: guardId,
        sector: guard.currentSector || "Base",
        details: `Guard ${guard.name} status changed to ${status.toUpperCase().replace("_", " ")}.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.updateGuard(guardId, { status }));
      }
    },

    quickHandover: (outgoingGuardId, incomingGuardId, notes) => {
      tacticalSound.playClick();
      const outgoing = get().guards.find((guard) => guard.id === outgoingGuardId);
      const incoming = get().guards.find((guard) => guard.id === incomingGuardId);
      if (!outgoing || !incoming) return;
      const postId = outgoing.currentPostId || "POST-A1-MAIN";
      const sector = outgoing.currentSector || "All Sectors";
      const now = new Date().toISOString();
      set((state) => ({
        guards: state.guards.map((guard) => {
          if (guard.id === outgoingGuardId) return { ...guard, status: "off_duty", currentPostId: null, currentSector: null };
          if (guard.id === incomingGuardId) return { ...guard, status: "on_post", currentPostId: postId, currentSector: sector, shiftStart: now };
          return guard;
        }),
      }));
      addLocalActivity({
        actorId: incomingGuardId,
        actorName: incoming.name,
        actionType: "handover_completed",
        targetType: "post",
        targetId: postId,
        sector,
        details: `Shift turnover at ${postId}: ${outgoing.name} handed over to ${incoming.name}. ${notes || "Turnover complete."}`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.handover({ outgoingGuardId, incomingGuardId, notes }));
      }
    },

    performShiftHandover: (postId, outgoingGuardId, incomingGuardId, notes) => {
      void postId;
      get().quickHandover(outgoingGuardId, incomingGuardId, notes);
    },

    reassignShift: (shiftId, newGuardId, newGuardName) => {
      tacticalSound.playClick();
      const shift = get().shifts.find((item) => item.id === shiftId);
      if (!shift) return;
      set((state) => ({
        shifts: state.shifts.map((item) =>
          item.id === shiftId ? { ...item, guardId: newGuardId, guardName: newGuardName } : item
        ),
      }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "shift_started",
        targetType: "post",
        targetId: shiftId,
        sector: shift.sector,
        details: `Roster updated: shift ${shiftId} assigned to ${newGuardName}.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.updateShift(shiftId, { guardId: newGuardId, guardName: newGuardName }));
      }
    },

    toggleCameraActive: (cameraId) => {
      tacticalSound.playClick();
      const camera = get().cameras.find((item) => item.id === cameraId);
      if (!camera) return;
      const status = camera.status === "online" ? "offline" : "online";
      const changes: Partial<Camera> = { status, aiActive: status === "online" };
      set((state) => ({ cameras: state.cameras.map((item) => item.id === cameraId ? { ...item, ...changes } : item) }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "zone_map_committed",
        targetType: "camera",
        targetId: cameraId,
        sector: camera.sector,
        details: `Camera ${camera.name} toggled ${status.toUpperCase()}.`,
      });
      if (get().backendStatus !== "offline") refreshAfter(backendApi.updateCamera(cameraId, changes));
    },

    setCameraSensitivity: (cameraId, threshold) => {
      const camera = get().cameras.find((item) => item.id === cameraId);
      if (!camera) return;
      const changes: Partial<Camera> = { confidenceThreshold: threshold };
      set((state) => ({ cameras: state.cameras.map((item) => item.id === cameraId ? { ...item, ...changes } : item) }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "zone_map_committed",
        targetType: "camera",
        targetId: cameraId,
        sector: camera.sector,
        details: `Camera ${camera.name} sensitivity adjusted to ${threshold}%.`,
      });
      if (get().backendStatus !== "offline") refreshAfter(backendApi.updateCamera(cameraId, changes));
    },

    updateCameraDetection: (cameraId, updates) => {
      tacticalSound.playClick();
      set((state) => ({ cameras: state.cameras.map((camera) => camera.id === cameraId ? { ...camera, ...updates } : camera) }));
      if (get().backendStatus !== "offline") refreshAfter(backendApi.updateCamera(cameraId, updates));
    },

    commitZoneMap: (cameraId, polygon, actorName) => {
      tacticalSound.playClick();
      const camera = get().cameras.find((item) => item.id === cameraId);
      if (!camera) return;
      const actor = actorName || get().currentUser.name;
      const changes: Partial<Camera> = { zonePolygon: polygon };
      set((state) => ({ cameras: state.cameras.map((item) => item.id === cameraId ? { ...item, ...changes } : item) }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: actor,
        actionType: "zone_map_committed",
        targetType: "camera",
        targetId: cameraId,
        sector: camera.sector,
        details: `Committed new detection zone polygon (${polygon.length} coordinates) for ${camera.name}.`,
      });
      if (get().backendStatus !== "offline") refreshAfter(backendApi.updateCamera(cameraId, changes));
    },

    addActivityLog: (entry) => {
      const activity = addLocalActivity(entry);
      if (get().backendStatus !== "offline") refreshAfter(backendApi.addActivity(activity));
    },

    resetData: () => {
      tacticalSound.playClick();
      set({
        guards: [],
        shifts: [],
        activityLog: [],
        alerts: [],
        cameras: [],
        sectors: [],
        offlineQueue: [],
        offlineLogQueue: [],
        lockdownActive: false,
        defconLevel: 2,
      });
      refreshAfter(backendApi.reset());
    },
  };
});
