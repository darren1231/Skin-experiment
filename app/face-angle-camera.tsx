"use client";

import {
  FaceLandmarker,
  FilesetResolver,
  type Matrix,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";

type PhotoAngle = "front" | "left" | "right";
type Landmark = Pick<NormalizedLandmark, "x" | "y" | "z">;
type PoseMetrics = {
  yaw: number;
  pitch: number;
  roll: number;
  faceFit: number;
  faceScale: number;
};

const TASKS_VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
// Directions are named from the photographed person's perspective, not from
// the mirrored camera preview's perspective.
const targetYaw: Record<PhotoAngle, number> = { front: 0, left: -35, right: 35 };
const angleName: Record<PhotoAngle, string> = { front: "正面", left: "左側 35°", right: "右側 35°" };
const GUIDE_ELLIPSE = { centerX: 0.5, centerY: 0.46, width: 0.47, height: 0.65 };
const MIN_FACE_FIT = 0.8;
const MAX_FACE_SCALE = 1.12;

export default function FaceAngleCamera({
  angle,
  onClose,
  onCapture,
  onFallback,
}: {
  angle: PhotoAngle;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const smoothedRef = useRef<PoseMetrics | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const [pose, setPose] = useState<PoseMetrics | null>(null);
  const [status, setStatus] = useState("正在載入三維臉部模型…");
  const [ready, setReady] = useState(false);
  const target = targetYaw[angle];
  const checks = pose ? getAlignmentChecks(pose, target, angle) : null;
  const aligned = checks ? Object.values(checks).every(Boolean) : false;

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const vision = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM);
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
        });
        if (cancelled || !videoRef.current) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          landmarker.close();
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("請將整張臉移入輪廓內");

        const detect = () => {
          const video = videoRef.current;
          const activeLandmarker = landmarkerRef.current;
          if (cancelled || !video || !activeLandmarker) return;

          if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = video.currentTime;
            const result = activeLandmarker.detectForVideo(video, performance.now());
            const landmarks = result.faceLandmarks[0];
            const transform = result.facialTransformationMatrixes[0];
            if (!landmarks || !transform) {
              setPose(null);
              smoothedRef.current = null;
              setReady(false);
              setStatus("請將整張臉移入輪廓內");
            } else {
              const smoothedPose = smoothPose(
                smoothedRef.current,
                estimatePose(landmarks, transform, video),
              );
              smoothedRef.current = smoothedPose;
              setPose(smoothedPose);
              setReady(true);
              setStatus(guidanceFor(smoothedPose, target, angle));
            }
          }
          animationRef.current = requestAnimationFrame(detect);
        };
        detect();
      } catch {
        setStatus("無法啟動角度偵測，請允許相機權限或改用系統相機");
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [angle, target]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `${angle}-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  return <div className="camera-modal" role="dialog" aria-modal="true" aria-label={`${angleName[angle]}拍攝引導`}>
    <div className="camera-sheet">
      <header><div><span>三維角度引導拍攝</span><b>{angleName[angle]}</b></div><button type="button" onClick={onClose} aria-label="關閉相機">×</button></header>
      <div className="guided-camera">
        <video ref={videoRef} muted playsInline />
        <div className={`face-guide ${aligned ? "aligned" : ""}`} aria-hidden="true" />
        <div className={`angle-readout ${aligned ? "aligned" : ""}`}>
          <div className="pose-values">
            <span><small>左右</small><strong>{formatDegree(pose?.yaw)}</strong></span>
            <span><small>抬低</small><strong>{formatDegree(pose?.pitch)}</strong></span>
            <span><small>傾斜</small><strong>{formatDegree(pose?.roll)}</strong></span>
          </div>
          <small className="pose-guidance">{status}</small>
        </div>
      </div>
      <div className="camera-target">
        <span>目標角度（Yaw） <b>{target > 0 ? "+" : ""}{target}°</b></span>
        <span className={aligned ? "is-ready" : ""}>{aligned ? "✓ 位置與角度正確，可以拍攝" : "請依提示調整"}</span>
      </div>
      <div className="pose-checks" aria-label="拍攝姿勢檢查">
        <PoseCheck label="左右角度" value={formatDegree(pose?.yaw)} ok={checks?.yaw} />
        <PoseCheck label="抬頭低頭" value={formatDegree(pose?.pitch)} ok={checks?.pitch} />
        <PoseCheck label="頭部傾斜" value={formatDegree(pose?.roll)} ok={checks?.roll} />
        <PoseCheck label="輪廓吻合度" value={faceFitLabel(pose)} ok={checks?.face} />
      </div>
      <div className="camera-actions">
        <button type="button" className="camera-fallback" onClick={onFallback}>改用系統相機</button>
        <button type="button" className="camera-shutter" disabled={!ready} onClick={capture} aria-label="拍照"><i /></button>
        <span>角度由三維臉部旋轉矩陣估算</span>
      </div>
    </div>
  </div>;
}

function PoseCheck({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return <div className={ok ? "ok" : ""}><span>{ok ? "✓" : "•"} {label}</span><b>{value}</b></div>;
}

function estimatePose(landmarks: Landmark[], transform: Matrix, video: HTMLVideoElement): PoseMetrics {
  const faceOval = [10, 21, 54, 103, 109, 127, 152, 234, 251, 284, 332, 338, 356, 454]
    .map((index) => landmarks[index]).filter((point): point is Landmark => Boolean(point));
  if (!faceOval.length) {
    return { yaw: 0, pitch: 0, roll: 0, faceFit: 0, faceScale: 0 };
  }
  const rotation = rotationMatrixToEuler(transform);
  const fit = calculateFaceFit(faceOval, video, rotation.yaw);
  return {
    ...rotation,
    ...fit,
  };
}

function calculateFaceFit(landmarks: Landmark[], video: HTMLVideoElement, yaw: number) {
  const sourceWidth = video.videoWidth || 1;
  const sourceHeight = video.videoHeight || 1;
  const displayWidth = video.clientWidth || 1;
  const displayHeight = video.clientHeight || 1;
  const scale = Math.max(displayWidth / sourceWidth, displayHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const cropX = (renderedWidth - displayWidth) / 2;
  const cropY = (renderedHeight - displayHeight) / 2;
  const points = landmarks.map((point) => ({
    x: (point.x * renderedWidth - cropX) / displayWidth,
    y: (point.y * renderedHeight - cropY) / displayHeight,
  }));
  const faceWidth = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
  const faceHeight = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
  const widthScale = faceWidth / GUIDE_ELLIPSE.width;
  const heightScale = faceHeight / GUIDE_ELLIPSE.height;
  // A correctly positioned face looks horizontally narrower as it turns.
  // Compensate the projected width before comparing it with the front-facing
  // guide, otherwise the ±35° shots can never reach the same fit threshold.
  const projectedWidth = Math.max(0.57, Math.cos(Math.min(Math.abs(yaw), 55) * Math.PI / 180));
  const correctedWidthScale = widthScale / projectedWidth;
  const faceScale = Math.max(correctedWidthScale, heightScale);
  const sizeFit = Math.min(correctedWidthScale, heightScale, 1);
  const pointsInside = points.filter((point) => {
    const normalizedX = (point.x - GUIDE_ELLIPSE.centerX) / (GUIDE_ELLIPSE.width / 2);
    const normalizedY = (point.y - GUIDE_ELLIPSE.centerY) / (GUIDE_ELLIPSE.height / 2);
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1.08 * 1.08;
  }).length / points.length;
  return {
    faceFit: Math.min(sizeFit, pointsInside),
    faceScale,
  };
}

/**
 * MediaPipe returns a column-major 4×4 facial transformation matrix. Extract
 * its 3×3 rotation block and decompose R = Rz(roll) · Ry(yaw) · Rx(pitch).
 * MediaPipe's camera-coordinate yaw and pitch signs are the reverse of the
 * photographed-person convention used by the UI, so those two axes are
 * inverted. Roll already matches the UI convention.
 */
function rotationMatrixToEuler(matrix: Matrix) {
  const d = matrix.data;
  if (matrix.rows < 3 || matrix.columns < 3 || d.length < 11) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }
  const r00 = d[0], r10 = d[1], r20 = d[2];
  const r21 = d[6], r22 = d[10];
  const yawRadians = Math.atan2(-r20, Math.hypot(r00, r10));
  const pitchRadians = Math.atan2(r21, r22);
  const rollRadians = Math.atan2(r10, r00);
  return {
    yaw: clamp(-toDegrees(yawRadians), -70, 70),
    pitch: clamp(-toDegrees(pitchRadians), -45, 45),
    roll: clamp(toDegrees(rollRadians), -45, 45),
  };
}

function toDegrees(radians: number) {
  return radians * 180 / Math.PI;
}

function smoothPose(previous: PoseMetrics | null, current: PoseMetrics): PoseMetrics {
  if (!previous) return current;
  const weight = 0.28;
  return Object.fromEntries(Object.keys(current).map((key) => {
    const metric = key as keyof PoseMetrics;
    return [metric, previous[metric] * (1 - weight) + current[metric] * weight];
  })) as unknown as PoseMetrics;
}

function getAlignmentChecks(pose: PoseMetrics, target: number, angle: PhotoAngle) {
  return {
    yaw: Math.abs(pose.yaw - target) <= (angle === "front" ? 6 : 10),
    pitch: Math.abs(pose.pitch) <= 7,
    roll: Math.abs(pose.roll) <= 5,
    face: pose.faceFit >= MIN_FACE_FIT && pose.faceScale <= MAX_FACE_SCALE,
  };
}

function guidanceFor(pose: PoseMetrics, target: number, angle: PhotoAngle) {
  const checks = getAlignmentChecks(pose, target, angle);
  const difference = target - pose.yaw;
  if (!checks.yaw) return difference > 0 ? "再向右轉一點" : "再向左轉一點";
  if (!checks.pitch) return pose.pitch > 0 ? "下巴再低一點" : "下巴再抬高一點";
  if (!checks.roll) return pose.roll > 0 ? "頭向左回正一點" : "頭向右回正一點";
  if (!checks.face) {
    if (pose.faceScale > MAX_FACE_SCALE) return "稍微離遠一點，讓臉留在提示框內";
    if (pose.faceFit < MIN_FACE_FIT) return "靠近一點，並讓臉部輪廓對齊提示框";
  }
  return "角度與臉部大小都已對齊";
}

function formatDegree(value?: number | null) {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}°`;
}

function faceFitLabel(pose: PoseMetrics | null) {
  if (!pose) return "偵測中";
  return `${Math.round(pose.faceFit * 100)}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

