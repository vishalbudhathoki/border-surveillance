"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  FileVideo,
  Link2,
  Monitor,
  RefreshCw,
  ShieldAlert,
  Upload,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TacticalButton } from "@/components/shared/TacticalButton";
import { backendApi, FrameDetection, FrameInferenceModule } from "@/lib/api/client";

interface LocalCameraFeedProps {
  className?: string;
}

type CameraState = "idle" | "starting" | "live" | "error";
type StreamSource = "camera" | "screen";
type InferenceState = "idle" | "analyzing" | "ready" | "error";
type SourceMode = "camera" | "file" | "network";

const INFERENCE_MODULES = ["person_tracking", "face_detection", "anpr"];

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));

const sourceButtonClass = (active: boolean) =>
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-none border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors font-mono",
    active
      ? "border-[#0284C7] bg-[#0284C7] text-white shadow-sm"
      : "border-[#CBDCEB] bg-[#FFFFFF] text-[#475569] hover:border-[#0284C7] hover:text-[#0F172A]"
  );

export const LocalCameraFeed: React.FC<LocalCameraFeedProps> = ({ className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("camera");
  const [activeSourceUrl, setActiveSourceUrl] = useState("");
  const [networkUrl, setNetworkUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [sourceLabel, setSourceLabel] = useState("LOCAL DEVICE CAMERA");
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [activeSource, setActiveSource] = useState<StreamSource | null>(null);
  const [error, setError] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [detections, setDetections] = useState<FrameDetection[]>([]);
  const [inferenceState, setInferenceState] = useState<InferenceState>("idle");
  const [inferenceError, setInferenceError] = useState("");
  const [modelName, setModelName] = useState("");
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [modules, setModules] = useState<FrameInferenceModule[]>([]);

  const resetAnalysis = useCallback(() => {
    setDetections([]);
    setInferenceState("idle");
    setInferenceError("");
    setModules([]);
    setModelName("");
    setInferenceMs(null);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const clearVideoSource = useCallback(() => {
    stopStream();
    releaseObjectUrl();
    setActiveSource(null);
    setActiveSourceUrl("");
    setFileName("");
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    resetAnalysis();
  }, [releaseObjectUrl, resetAnalysis, stopStream]);

  const attachStream = useCallback((stream: MediaStream, source: StreamSource) => {
    streamRef.current = stream;
    setActiveSource(source);
    if (videoRef.current) videoRef.current.srcObject = stream;
    setCameraState("live");

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.onended = () => {
        if (streamRef.current !== stream) return;
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setActiveSource(null);
        setCameraState("idle");
        setError(source === "screen" ? "Screen sharing ended." : "The camera stream ended.");
      };
    }
  }, []);

  const listDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const available = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "videoinput"
    );
    setDevices(available);
    setSelectedDeviceId((current) => current || available[0]?.deviceId || "");
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser does not expose a local camera.");
        setCameraState("error");
        return;
      }

      setSourceMode("camera");
      setSourceLabel("LOCAL DEVICE CAMERA");
      setCameraState("starting");
      setError("");
      clearVideoSource();
      setActiveSource("camera");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" },
          audio: false,
        });
        attachStream(stream, "camera");
        await listDevices();
      } catch (cameraError) {
        const errorName = cameraError instanceof DOMException ? cameraError.name : "";
        setError(
          errorName === "NotAllowedError"
            ? "Camera permission was denied. Allow access in the browser and try again."
            : errorName === "NotFoundError"
            ? "No camera device is available on this machine."
            : "The local camera could not be opened. Check that it is not in use by another app."
        );
        setActiveSource(null);
        setCameraState("error");
      }
    },
    [attachStream, clearVideoSource, listDevices]
  );

  const chooseSourceMode = useCallback(
    (mode: SourceMode) => {
      if (mode === sourceMode) return;
      clearVideoSource();
      setSourceMode(mode);
      setSourceLabel(mode === "file" ? "VIDEO FILE" : "NETWORK CCTV");
      setCameraState("idle");
      setError("");
    },
    [clearVideoSource, sourceMode]
  );

  const loadVideoFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      clearVideoSource();
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;
      setSourceMode("file");
      setSourceLabel(file.name.toUpperCase());
      setFileName(file.name);
      setActiveSourceUrl(objectUrl);
      setCameraState("starting");
      setError("");
    },
    [clearVideoSource]
  );

  const connectNetwork = useCallback(() => {
    const enteredUrl = networkUrl.trim();
    if (!enteredUrl) {
      setError("Enter an HTTP(S) camera URL or stream address first.");
      setCameraState("error");
      return;
    }
    if (/^rtsps?:\/\//i.test(enteredUrl)) {
      setError("RTSP cannot play directly in a browser. Provide an HLS, WebRTC, or HTTP(S) relay URL instead.");
      setCameraState("error");
      return;
    }

    const normalizedUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(enteredUrl)
      ? enteredUrl
      : `http://${enteredUrl}`;
    try {
      const parsed = new URL(normalizedUrl);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("unsupported protocol");
      clearVideoSource();
      setSourceMode("network");
      setSourceLabel(`CCTV ${parsed.hostname}`.toUpperCase());
      setActiveSourceUrl(parsed.toString());
      setCameraState("starting");
      setError("");
    } catch {
      setError("Enter a valid HTTP(S) camera URL, for example http://192.168.1.50:8080/video.");
      setCameraState("error");
    }
  }, [clearVideoSource, networkUrl]);

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("This browser does not support laptop screen sharing.");
      setCameraState("error");
      return;
    }

    clearVideoSource();
    setSourceMode("camera");
    setSourceLabel("SCREEN TEST SOURCE");
    setCameraState("starting");
    setActiveSource("screen");
    setError("");

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      attachStream(stream, "screen");
    } catch (screenError) {
      const errorName = screenError instanceof DOMException ? screenError.name : "";
      setError(
        errorName === "NotAllowedError"
          ? "Screen sharing was cancelled or denied. Choose a window or tab and try again."
          : "The laptop screen could not be shared."
      );
      setActiveSource(null);
      setCameraState("error");
    }
  }, [attachStream, clearVideoSource]);

  useEffect(() => {
    void listDevices();
    return () => {
      stopStream();
      releaseObjectUrl();
    };
  }, [listDevices, releaseObjectUrl, stopStream]);

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraState]);

  useEffect(() => {
    if (cameraState !== "live") {
      resetAnalysis();
      return;
    }

    let cancelled = false;
    let requestRunning = false;
    let nextRun: number | null = null;

    const applyResult = (result: Awaited<ReturnType<typeof backendApi.analyzeFrame>>) => {
      setDetections(result.detections);
      setModules(result.modules);
      setModelName(`${result.model} · ${result.device.toUpperCase()}`);
      setInferenceMs(result.inferenceMs);
      setInferenceState("ready");
    };

    const analyzeCurrentFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (cancelled) return;
      if (
        requestRunning ||
        !video ||
        !canvas ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        (sourceMode !== "camera" && video.paused)
      ) {
        nextRun = window.setTimeout(() => void analyzeCurrentFrame(), 150);
        return;
      }

      requestRunning = true;
      setInferenceState("analyzing");
      setInferenceError("");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        requestRunning = false;
        setInferenceState("error");
        setInferenceError("The browser could not prepare a frame for AI analysis.");
        return;
      }

      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = await canvasToBlob(canvas);
        if (!frame) throw new Error("Could not encode the source frame.");
        const result = await backendApi.analyzeFrame(frame, INFERENCE_MODULES);
        if (!cancelled) applyResult(result);
      } catch (analysisError) {
        if (!cancelled) {
          setInferenceState("error");
          setInferenceError(
            analysisError instanceof Error
              ? analysisError.message
              : "The AI endpoint is unavailable."
          );
        }
      } finally {
        requestRunning = false;
        if (!cancelled) nextRun = window.setTimeout(() => void analyzeCurrentFrame(), 80);
      }
    };

    void analyzeCurrentFrame();
    return () => {
      cancelled = true;
      if (nextRun !== null) window.clearTimeout(nextRun);
    };
  }, [cameraState, resetAnalysis, sourceMode]);

  const handleVideoReady = () => {
    if (sourceMode === "camera") return;
    setError("");
    setCameraState("live");
    void videoRef.current?.play().catch(() => undefined);
  };

  const handleVideoError = () => {
    setCameraState("error");
    setError(
      sourceMode === "network"
        ? "The CCTV URL could not be played. Check the URL, camera access, and CORS; browser playback requires a compatible HTTP(S) stream."
        : "The selected video could not be decoded by this browser. Try MP4/H.264 or WebM."
    );
  };

  const isLive = cameraState === "live";

  return (
    <section
      className={cn(
        "relative bg-[#FFFFFF] border border-[#CBDCEB] rounded-none overflow-hidden flex flex-col font-mono shadow-sm",
        className
      )}
    >
      <div className="absolute top-0 inset-x-0 z-10 bg-[#0F172A]/90 border-b border-[#38BDF8]/40 p-3 flex items-center justify-between text-[11px] pointer-events-none text-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("w-2 h-2 rounded-full shrink-0", isLive ? "bg-[#0284C7] animate-pulse" : "bg-[#94A3B8]")} />
          <span className="font-bold tracking-widest text-white truncate uppercase">
            {activeSource === "screen" ? "SCREEN TEST SOURCE" : sourceLabel}
          </span>
        </div>
        <span className={cn("text-[10px] font-bold uppercase tracking-wider", isLive ? "text-[#38BDF8]" : "text-[#94A3B8]")}>
          {isLive ? "LIVE // ACTIVE" : cameraState === "starting" ? "INITIALIZING" : cameraState === "error" ? "UNAVAILABLE" : "STANDBY"}
        </span>
      </div>

      {/* Top Source Mode Selector */}
      <div className="border-b border-[#CBDCEB] bg-[#F0F6FC] px-4 pt-3 pb-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-[#0F172A] font-bold uppercase tracking-widest mr-1">INPUT_SOURCE</span>
          <button type="button" className={sourceButtonClass(sourceMode === "camera")} onClick={() => chooseSourceMode("camera")}>
            <Camera className="w-3.5 h-3.5" /> DEVICE CAMERA
          </button>
          <button type="button" className={sourceButtonClass(sourceMode === "file")} onClick={() => chooseSourceMode("file")}>
            <FileVideo className="w-3.5 h-3.5" /> VIDEO FILE
          </button>
          <button type="button" className={sourceButtonClass(sourceMode === "network")} onClick={() => chooseSourceMode("network")}>
            <Wifi className="w-3.5 h-3.5" /> CCTV / IP STREAM
          </button>
        </div>

        {sourceMode === "camera" && (
          <div className="flex flex-wrap items-center gap-2">
            {devices.length > 0 && (
              <select
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                className="min-w-0 flex-1 bg-[#FFFFFF] border border-[#CBDCEB] rounded-none px-2.5 py-1.5 text-[11px] text-[#0F172A] font-mono"
                aria-label="Select local camera"
              >
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            )}
            <TacticalButton
              size="sm"
              onClick={() => void startCamera(selectedDeviceId || undefined)}
              icon={cameraState === "error" ? <RefreshCw className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
            >
              {cameraState === "live" ? "RESTART CAMERA" : "ENABLE CAMERA"}
            </TacticalButton>
            <TacticalButton
              size="sm"
              variant="secondary"
              onClick={() => void startScreenShare()}
              icon={<Monitor className="w-3.5 h-3.5" />}
            >
              TEST WITH SCREEN SHARE
            </TacticalButton>
          </div>
        )}

        {sourceMode === "file" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-none border border-[#0284C7] bg-[#0284C7] px-3 py-1.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-sm hover:bg-[#0369A1] transition-colors">
              <Upload className="w-3.5 h-3.5" /> SELECT VIDEO
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(event) => loadVideoFile(event.target.files?.[0])}
              />
            </label>
            <span className="text-[10px] text-[#64748B] truncate max-w-full">
              {fileName || "MP4, WebM format supported"}
            </span>
          </div>
        )}

        {sourceMode === "network" && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Link2 className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
              <input
                value={networkUrl}
                onChange={(event) => setNetworkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") connectNetwork();
                }}
                placeholder="http://192.168.1.50:8080/video"
                className="w-full min-w-0 bg-[#FFFFFF] border border-[#CBDCEB] rounded-none px-3 py-1.5 text-[11px] text-[#0F172A] placeholder:text-[#64748B] focus:border-[#0284C7] font-mono"
                aria-label="CCTV network stream URL"
              />
            </div>
            <TacticalButton size="sm" onClick={connectNetwork} icon={<Wifi className="w-3.5 h-3.5" />}>
              CONNECT STREAM
            </TacticalButton>
          </div>
        )}
        {sourceMode === "network" && (
          <p className="text-[10px] leading-relaxed text-[#64748B]">
            LAN CCTV: connect the camera and this computer to the same network, then enter its HTTP(S), HLS, or WebRTC URL. Raw RTSP needs a local HLS/WebRTC relay before browser playback.
          </p>
        )}
      </div>

      {/* Video Display Area */}
      <div className="relative aspect-video min-h-[220px] bg-[#0B1320] flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          src={activeSourceUrl || undefined}
          autoPlay
          muted
          playsInline
          controls={sourceMode !== "camera"}
          crossOrigin={sourceMode === "network" ? "anonymous" : undefined}
          onLoadedMetadata={handleVideoReady}
          onCanPlay={handleVideoReady}
          onError={handleVideoError}
          onEnded={() => {
            if (sourceMode === "file") {
              setCameraState("idle");
              setError("Video finished. Choose file again to replay.");
            }
          }}
          className={cn("w-full h-full object-contain", !isLive && "hidden")}
        />
        <canvas ref={canvasRef} className="hidden" />
        {isLive && (
          <>
            {detections.map((detection, index) => (
              <div
                key={`${detection.source}-${detection.label}-${index}`}
                className="absolute border-2 border-[#38BDF8] pointer-events-none rounded-none"
                style={{
                  left: `${detection.box.x}%`,
                  top: `${detection.box.y}%`,
                  width: `${detection.box.width}%`,
                  height: `${detection.box.height}%`,
                }}
              >
                <span
                  className="absolute -top-5 left-0 whitespace-nowrap bg-[#0284C7] text-white px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded-none shadow-sm"
                >
                  {detection.attributes?.plate_number
                    ? String(detection.attributes.plate_number)
                    : detection.label}
                  {detection.trackId ? ` #${detection.trackId}` : ""} {(detection.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            <div className="absolute top-12 left-3 bg-[#0F172A]/90 border border-[#38BDF8]/40 rounded-none px-2 py-1 text-[10px] text-white font-mono">
              AI_{inferenceState === "analyzing" ? "ANALYZING" : inferenceState === "error" ? "UNAVAILABLE" : "ACTIVE"} // {detections.length} TARGET{detections.length === 1 ? "" : "S"}
            </div>
          </>
        )}
        {!isLive && (
          <div className="p-6 text-center max-w-md font-mono">
            {cameraState === "error" ? (
              <CameraOff className="w-8 h-8 mx-auto mb-3 text-[#DC2626]" />
            ) : activeSource === "screen" ? (
              <Monitor className="w-8 h-8 mx-auto mb-3 text-[#38BDF8] opacity-70" />
            ) : (
              <Camera className="w-8 h-8 mx-auto mb-3 text-[#38BDF8] opacity-70" />
            )}
            <p className="text-xs text-[#0F172A] uppercase tracking-wider font-bold">
              {cameraState === "starting"
                ? activeSource === "screen"
                ? "Requesting screen share"
                : "Opening video source"
                : cameraState === "error"
                ? error
                : sourceMode === "file"
                ? "Select a video file to analyze"
                : sourceMode === "network"
                ? "Enter a CCTV / IP stream URL above"
                : "No local camera stream started"}
            </p>
            {cameraState === "error" && sourceMode === "camera" && (
              <TacticalButton size="sm" className="mt-4" onClick={() => void startCamera(selectedDeviceId || undefined)} icon={<RefreshCw className="w-3.5 h-3.5" />}>
                RETRY CAMERA
              </TacticalButton>
            )}
          </div>
        )}
      </div>

      {/* AI Pipeline Modules */}
      <div className="border-t border-[#CBDCEB] bg-[#F0F6FC] px-4 py-3 font-mono">
        <div className="flex items-center justify-between gap-2 text-[10px] text-[#475569] uppercase tracking-widest">
          <span className="text-[#0F172A] font-bold">AI_MODULE_PIPELINE</span>
          <span className="truncate font-semibold text-[#0284C7]">{modelName || "AWAITING FRAME DATA"}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2.5">
          {modules.length === 0 && (
            <div className="sm:col-span-3 border border-[#CBDCEB] bg-[#FFFFFF] px-3 py-2 text-[10px] text-[#64748B]">
              Activate camera, screen share, or video file to engage person tracking, face detection, and ANPR inference.
            </div>
          )}
          {modules.map((module) => (
            <div key={module.id} className="border border-[#CBDCEB] rounded-none bg-[#FFFFFF] p-2 min-w-0 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#0F172A] font-bold truncate uppercase">{module.label}</span>
                <span className={cn(
                  "text-[9px] font-bold uppercase",
                  module.status === "active" ? "text-[#16A34A]" : "text-[#64748B]"
                )}>{module.status}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1 text-[9px] text-[#64748B]">
                <span className="truncate">{module.model}</span>
                <span className="font-bold text-[#0284C7]">{module.detectionCount} DETECTIONS</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="border-t border-[#CBDCEB] bg-[#FFFFFF] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#475569]">
        <span className="flex items-center gap-1.5 min-w-0">
          {isLive ? <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" /> : <ShieldAlert className="w-3.5 h-3.5 text-[#64748B] shrink-0" />}
          <span className="truncate uppercase font-bold text-[#0F172A]">
            {!isLive
              ? sourceMode === "network"
                ? "WAITING FOR CCTV STREAM"
                : sourceMode === "file"
                ? "WAITING FOR VIDEO FILE"
                : "READY // CAMERA PERMISSION REQUIRED"
              : inferenceState === "error"
              ? inferenceError
              : `AI_${inferenceState === "analyzing" ? "ANALYZING" : "ACTIVE"}${modelName ? ` // ${modelName}` : ""}${inferenceMs !== null ? ` // ${inferenceMs}ms` : ""}`}
          </span>
        </span>
      </div>
    </section>
  );
};
