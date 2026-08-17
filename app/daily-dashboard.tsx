"use client";
/* eslint-disable @next/next/no-img-element -- authenticated project photos use protected API URLs */

import { useEffect, useRef, useState } from "react";
import Dashboard from "./dashboard";

type Project = {
  id: string;
  name: string;
  description: string;
  enableFaceAngleGuidance: boolean;
};
type Photo = {
  id: number;
  projectId: string;
  projectName: string;
  capturedDate: string;
  capturedTime: string | null;
  captureTimeKnown: boolean;
  photoSource: "camera" | "album" | "historical_import";
  note: string;
  dailyNumber: number;
  url: string;
};
type ProjectCheckin = {
  id: number;
  projectId: string;
  projectName: string;
  entryDate: string;
  metrics: string;
  sleep: number;
  stress: number;
  note: string;
};

const PHOTO_TARGET_BYTES = 650 * 1024;
const PHOTO_MAX_DIMENSION = 1600;

export default function DailyDashboard({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [showTools, setShowTools] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [records, setRecords] = useState<ProjectCheckin[]>([]);
  const [projectId, setProjectId] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTaipeiDateTime().date);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [projectResponse, photoResponse, recordResponse] = await Promise.all([
        fetch("/api/projects"), fetch("/api/project-photos"), fetch("/api/project-checkins"),
      ]);
      if (!projectResponse.ok || !photoResponse.ok || !recordResponse.ok) throw new Error("讀取每日紀錄失敗");
      const [projectData, photoData, recordData] = await Promise.all([
        projectResponse.json() as Promise<{ projects?: Project[] }>,
        photoResponse.json() as Promise<{ photos?: Photo[] }>,
        recordResponse.json() as Promise<{ records?: ProjectCheckin[]; migrationRequired?: boolean }>,
      ]);
      const nextProjects = projectData.projects ?? [];
      setProjects(nextProjects);
      setPhotos(photoData.photos ?? []);
      setRecords(recordData.records ?? []);
      setMigrationRequired(recordData.migrationRequired === true);
      setProjectId((current) => current || nextProjects[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "暫時無法讀取資料");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  if (showTools) return <>
    <button
      onClick={() => { setShowTools(false); void refresh(); }}
      style={{ position: "fixed", top: 12, right: 12, zIndex: 1000, padding: "10px 14px", borderRadius: 999, border: "1px solid #d7d7d7", background: "white", cursor: "pointer" }}
    >← 回每日紀錄</button>
    <Dashboard userName={userName} userEmail={userEmail} />
  </>;

  const selectedProject = projects.find((project) => project.id === projectId);
  const dayPhotos = photos.filter((photo) => photo.projectId === projectId && photo.capturedDate === selectedDate)
    .sort((a, b) => (a.capturedTime ?? "99:99").localeCompare(b.capturedTime ?? "99:99") || a.id - b.id);
  const record = records.find((item) => item.projectId === projectId && item.entryDate === selectedDate);

  async function uploadFiles(files: File[], source: Photo["photoSource"]) {
    if (!projectId || !files.length || uploading) return;
    setUploading(true);
    setMessage(`正在處理 ${files.length} 張照片…`);
    let completed = 0;
    try {
      for (const original of files) {
        const file = await preparePhoto(original);
        const captured = source === "camera" ? getTaipeiDateTime() : getTaipeiDateTime(new Date(original.lastModified || Date.now()));
        const body = new FormData();
        body.append("photo", file);
        body.append("projectId", projectId);
        body.append("capturedDate", selectedDate);
        body.append("capturedTime", captured.time);
        body.append("photoSource", source);
        body.append("captureTimeSource", source === "camera" ? "camera_now" : "file_last_modified");
        body.append("note", "");
        const response = await fetch("/api/project-photos", { method: "POST", body });
        const data = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(data.error || `照片上傳失敗（HTTP ${response.status}）`);
        completed += 1;
      }
      await refresh();
      setMessage(`✓ 已加入 ${completed} 張照片到 ${selectedDate} 的每日紀錄。`);
    } catch (error) {
      setMessage(`${completed} 張已保存；${error instanceof Error ? error.message : "照片處理失敗"}`);
    } finally {
      setUploading(false);
    }
  }

  return <main className="app-shell project-app">
    <input ref={cameraRef} hidden type="file" accept="image/*" capture="user" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) void uploadFiles([file], "camera");
      event.target.value = "";
    }} />
    <input ref={albumRef} hidden multiple type="file" accept="image/*" onChange={(event) => {
      void uploadFiles(Array.from(event.target.files ?? []), "historical_import");
      event.target.value = "";
    }} />

    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">膚</span><div><b>每日紀錄</b><small>PROJECT JOURNAL</small></div></div>
      <nav aria-label="主要功能">
        <button className="active"><span>●</span>每日紀錄</button>
        <button onClick={() => setShowTools(true)}><span>▦</span>完整工具</button>
      </nav>
      <div className="sidebar-note"><span>新的資料關聯</span><b>專案＋日期＝一份完整紀錄</b><div className="mini-progress"><i /></div><small>照片與日誌不再分成兩套</small></div>
      <div className="profile"><div className="avatar">{userName.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{userName}</b><small>{userEmail}</small></div></div>
    </aside>

    <section className="content">
      <header className="topbar"><div><p>照片與日誌依同一個專案、同一天整合</p><h1>每日紀錄</h1></div><div className="account-actions"><button onClick={() => setShowTools(true)}>完整工具</button><a className="privacy" href="/auth/signout">登出</a></div></header>
      {message && <div className="app-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
      {migrationRequired && <div className="app-message">需要先在 Supabase SQL Editor 執行此 PR 的 supabase/schema.sql，才能儲存與顯示專案日誌。照片功能仍可正常使用。</div>}
      {loading ? <section className="paper-card empty-history"><b>正在讀取每日紀錄…</b></section> : !projects.length ? <section className="paper-card empty-history">
        <b>還沒有追蹤專案</b><p>先到完整工具建立第一個專案；之後每個專案都會擁有自己的每日照片與日誌。</p><button className="primary" onClick={() => setShowTools(true)}>建立專案</button>
      </section> : <>
        <section className="paper-card">
          <div className="section-title"><div><span className="eyebrow">每日紀錄索引</span><h2>{selectedProject?.name ?? "選擇專案"}</h2></div><span className="private-label">{dayPhotos.length} 張照片</span></div>
          <div className="date-time-row">
            <label>追蹤專案<select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label>紀錄日期<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
          </div>
          <p className="soft-note">同一個專案的照片與日誌，現在都以這個日期為共同索引。</p>
        </section>

        <section className="paper-card">
          <div className="section-title"><div><span className="eyebrow">當日照片</span><h2>{selectedDate}</h2></div><div className="button-row"><button disabled={uploading} onClick={() => cameraRef.current?.click()}>拍照</button><button disabled={uploading} onClick={() => albumRef.current?.click()}>加入相簿照片</button></div></div>
          {selectedProject?.enableFaceAngleGuidance && <p className="soft-note">此專案有啟用臉部角度提示；需要角度導引拍攝時請使用「完整工具」。</p>}
          {dayPhotos.length ? <div className="library-grid">{dayPhotos.map((photo) => <button key={photo.id} onClick={() => setShowTools(true)}>
            <img src={photo.url} alt={`${photo.projectName} 第 ${photo.dailyNumber} 張`} loading="lazy" />
            <div><b>第 {photo.dailyNumber} 張</b><span>{displayTime(photo)}</span><small>{photo.photoSource === "camera" ? "即時拍攝" : "相簿／歷史照片"}</small><p>{photo.note || "沒有照片備註"}</p></div>
          </button>)}</div> : <div className="empty-history"><b>這一天還沒有照片</b><p>可以直接拍攝或從相簿加入；照片會和下方日誌歸在同一份每日紀錄。</p></div>}
        </section>

        <DailyEntryForm key={`${projectId}:${selectedDate}:${record?.id ?? "new"}`} projectId={projectId} entryDate={selectedDate} record={record} onSaved={refresh} disabled={migrationRequired} />
      </>}
      <footer className="disclaimer">本工具用於個人追蹤，不代替專業醫療診斷。</footer>
    </section>
  </main>;
}

function DailyEntryForm({ projectId, entryDate, record, onSaved, disabled }: {
  projectId: string;
  entryDate: string;
  record?: ProjectCheckin;
  onSaved: () => Promise<void>;
  disabled?: boolean;
}) {
  const [sleep, setSleep] = useState(record?.sleep ?? 7);
  const [stress, setStress] = useState(record?.stress ?? 2);
  const [note, setNote] = useState(record?.note ?? "");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!projectId || saving || disabled) return;
    setSaving(true); setStatus("儲存中…");
    let metrics: Record<string, unknown> = {};
    try { metrics = record?.metrics ? JSON.parse(record.metrics) as Record<string, unknown> : {}; } catch { metrics = {}; }
    try {
      const response = await fetch("/api/project-checkins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, entryDate, sleep, stress, note, metrics }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "每日紀錄儲存失敗");
      await onSaved();
      setStatus("✓ 照片與日誌已歸在同一份每日紀錄");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "每日紀錄儲存失敗");
    } finally { setSaving(false); }
  }

  return <section className="paper-card journal-editor">
    <div className="section-title"><div><span className="eyebrow">當日日誌</span><h2>{record ? "編輯每日紀錄" : "新增每日紀錄"}</h2></div>{record && <span className="private-label">已保存</span>}</div>
    <div className="date-time-row">
      <label>睡眠時數<input type="number" min="0" max="24" step=".5" value={sleep} onChange={(event) => setSleep(Number(event.target.value))} /></label>
      <label>壓力程度（0–5）<input type="number" min="0" max="5" value={stress} onChange={(event) => setStress(Number(event.target.value))} /></label>
    </div>
    <label className="field">當日備註<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="今天做了什麼改變、使用什麼產品、身體或皮膚有什麼狀況？" /></label>
    <div className="save-bar"><span>{disabled ? "請先執行 Supabase migration" : status || "儲存後會以專案＋日期更新同一筆紀錄"}</span><button className="primary" disabled={saving || disabled} onClick={() => void save()}>{saving ? "儲存中…" : "儲存每日紀錄"}</button></div>
  </section>;
}

function displayTime(photo: Photo) { return photo.captureTimeKnown && photo.capturedTime ? photo.capturedTime : "時間未知"; }
function getTaipeiDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

async function preparePhoto(original: File) {
  if (!original.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(original.name)) throw new Error("請選擇照片檔案");
  let file = original;
  if (/heic|heif/i.test(original.type) || /\.(heic|heif)$/i.test(original.name)) {
    const { default: heic2any } = await import("heic2any");
    const result = await heic2any({ blob: original, toType: "image/jpeg", quality: .9 });
    const blob = Array.isArray(result) ? result[0] : result;
    file = new File([blob], `${original.name.replace(/\.(heic|heif)$/i, "") || "photo"}.jpg`, { type: "image/jpeg", lastModified: original.lastModified });
  }
  const image = await loadImage(file);
  try {
    let width = image.naturalWidth, height = image.naturalHeight;
    const ratio = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(width, height));
    width = Math.max(1, Math.round(width * ratio)); height = Math.max(1, Math.round(height * ratio));
    let compressed: Blob | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("瀏覽器無法處理照片");
      context.drawImage(image, 0, 0, width, height);
      compressed = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("照片壓縮失敗")), "image/jpeg", Math.max(.45, .82 - attempt * .07)));
      if (compressed.size <= PHOTO_TARGET_BYTES) break;
      width = Math.max(1, Math.round(width * .8)); height = Math.max(1, Math.round(height * .8));
    }
    if (!compressed || compressed.size > PHOTO_TARGET_BYTES) throw new Error("照片壓縮後仍超過上傳限制");
    return new File([compressed], `${original.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg", lastModified: original.lastModified });
  } finally { URL.revokeObjectURL(image.src); }
}

async function loadImage(file: File) {
  const src = URL.createObjectURL(file);
  const image = new Image(); image.src = src;
  try { await image.decode(); return image; } catch { URL.revokeObjectURL(src); throw new Error("瀏覽器無法讀取這張照片"); }
}
