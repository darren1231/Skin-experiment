"use client";
/* eslint-disable @next/next/no-img-element -- authenticated R2 photos use protected dynamic URLs */

import { useEffect, useRef, useState } from "react";
import FaceAngleCamera from "./face-angle-camera";

type Project = {
  id: string;
  name: string;
  description: string;
  enableFaceAngleGuidance: boolean;
  createdAt: string;
  updatedAt: string;
};
type Photo = {
  id: number;
  projectId: string;
  projectName: string;
  capturedDate: string;
  capturedTime: string | null;
  capturedAt: string | null;
  captureTimeKnown: boolean;
  captureTimeSource: string;
  uploadedAt: string;
  photoSource: "camera" | "album" | "historical_import";
  note: string;
  dailyNumber: number;
  url: string;
};
type Journal = { id: number; entryDate: string; note: string; metrics: string; sleep: number; stress: number };
type Draft = {
  id: string;
  file: File;
  preview: string;
  originalName: string;
  originalType: string;
  originalSize: number;
  capturedDate: string;
  capturedTime: string;
  note: string;
  photoSource: Photo["photoSource"];
  captureTimeSource: string;
  status?: string;
};
type FaceAngle = "front" | "left" | "right";
type Tab = "home" | "capture" | "upload" | "library" | "compare" | "calendar" | "journal" | "projects";

const PHOTO_TARGET_BYTES = 650 * 1024;
const PHOTO_MAX_COMPRESSION_ATTEMPTS = 6;
const PHOTO_MAX_DIMENSION = 1600;
const FACE_ANGLES: Array<[FaceAngle, string]> = [["front", "正面"], ["left", "左臉 35°"], ["right", "右臉 35°"]];
const SOURCE_LABEL: Record<Photo["photoSource"], string> = {
  camera: "即時相機拍攝",
  album: "相簿上傳",
  historical_import: "歷史照片匯入",
};

export default function Dashboard({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [tab, setTab] = useState<Tab>("home");
  const [projects, setProjects] = useState<Project[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [faceAngle, setFaceAngle] = useState<FaceAngle>("front");
  const [replaceDraftId, setReplaceDraftId] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  async function refresh() {
    setLoading(true);
    try {
      const [projectResponse, photoResponse, journalResponse] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/project-photos"),
        fetch("/api/checkins"),
      ]);
      if (!projectResponse.ok || !photoResponse.ok || !journalResponse.ok) throw new Error("讀取資料失敗");
      const [projectData, photoData, journalData] = await Promise.all([
        projectResponse.json() as Promise<{ projects?: Project[] }>,
        photoResponse.json() as Promise<{ photos?: Photo[] }>,
        journalResponse.json() as Promise<{ records?: Journal[] }>,
      ]);
      setProjects(projectData.projects ?? []);
      setPhotos(photoData.photos ?? []);
      setJournals(journalData.records ?? []);
      setSelectedProjectId((current) => current || projectData.projects?.[0]?.id || "");
    } catch {
      setMessage("暫時無法讀取資料，請重新整理後再試。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([fetch("/api/projects"), fetch("/api/project-photos"), fetch("/api/checkins")])
      .then(async ([projectResponse, photoResponse, journalResponse]) => {
        if (!projectResponse.ok || !photoResponse.ok || !journalResponse.ok) throw new Error("讀取資料失敗");
        const [projectData, photoData, journalData] = await Promise.all([
          projectResponse.json() as Promise<{ projects?: Project[] }>,
          photoResponse.json() as Promise<{ photos?: Photo[] }>,
          journalResponse.json() as Promise<{ records?: Journal[] }>,
        ]);
        setProjects(projectData.projects ?? []);
        setPhotos(photoData.photos ?? []);
        setJournals(journalData.records ?? []);
        setSelectedProjectId(projectData.projects?.[0]?.id || "");
      })
      .catch(() => setMessage("暫時無法讀取資料，請重新整理後再試。"))
      .finally(() => setLoading(false));
  }, []);

  async function addDraft(file: File, source: Draft["photoSource"], targetId?: string | null) {
    const suggested = suggestCaptureDateTime(file);
    const prepared = await preparePhotoForUpload(file);
    const next: Draft = {
      id: targetId || crypto.randomUUID(),
      file: prepared,
      preview: URL.createObjectURL(prepared),
      originalName: file.name || "未命名照片",
      originalType: file.type || "瀏覽器未提供格式",
      originalSize: file.size,
      capturedDate: suggested.date,
      capturedTime: suggested.time,
      note: "",
      photoSource: source,
      captureTimeSource: suggested.source,
    };
    setDrafts((current) => {
      const old = current.find((draft) => draft.id === targetId);
      if (old) URL.revokeObjectURL(old.preview);
      return old ? current.map((draft) => draft.id === targetId ? { ...next, note: draft.note } : draft) : [...current, next];
    });
  }

  async function acceptPhotos(files: File[], source: Draft["photoSource"], targetId?: string | null) {
    if (!files.length) return;
    setMessage(`正在處理 ${files.length} 張照片…`);
    const failures: string[] = [];
    let accepted = 0;
    for (const file of files) {
      try {
        await addDraft(file, source, targetId);
        accepted += 1;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "未知錯誤";
        failures.push(`${file.name || "未命名照片"}（${file.type || "未知格式"}、${formatBytes(file.size)}）：${detail}`);
      }
    }
    setReplaceDraftId(null);
    setMessage(failures.length
      ? `成功處理 ${accepted} 張；失敗 ${failures.length} 張。${failures.join("；")}`
      : `${accepted} 張照片已統一轉成 JPEG 並完成壓縮。`);
  }

  function startCamera(replaceId?: string) {
    setReplaceDraftId(replaceId ?? null);
    if (selectedProject?.enableFaceAngleGuidance) setCameraOpen(true);
    else cameraInputRef.current?.click();
  }

  async function saveDrafts() {
    if (!selectedProjectId || !drafts.length || saving) return;
    setSaving(true);
    setMessage("");
    let completed = 0;
    try {
      for (const draft of drafts) {
        setDrafts((all) => all.map((item) => item.id === draft.id ? { ...item, status: "上傳中…" } : item));
        try {
          await uploadPreparedPhoto(draft, selectedProjectId);
        } catch (error) {
          setDrafts((all) => all.map((item) => item.id === draft.id ? { ...item, status: "上傳失敗，請查看上方訊息" } : item));
          throw error;
        }
        completed += 1;
        setDrafts((all) => all.map((item) => item.id === draft.id ? { ...item, status: "✓ 已安全保存" } : item));
      }
      drafts.forEach((draft) => URL.revokeObjectURL(draft.preview));
      setDrafts([]);
      await refresh();
      setMessage(`已保存 ${completed} 張照片。`);
      setTab("library");
    } catch (error) {
      setMessage(`${completed} 張已保存；${error instanceof Error ? error.message : "其餘照片上傳失敗"}`);
    } finally {
      setSaving(false);
    }
  }

  const nav: Array<[Tab, string, string]> = [
    ["home", "首頁", "⌂"], ["capture", "拍照", "◎"], ["upload", "歷史上傳", "＋"],
    ["library", "照片庫", "▦"], ["compare", "比較", "⇄"], ["calendar", "日曆", "□"],
    ["journal", "日誌", "✎"], ["projects", "專案", "⚙"],
  ];

  return <main className="app-shell project-app">
    {cameraOpen && <FaceAngleCamera
      angle={faceAngle}
      onClose={() => { setCameraOpen(false); setReplaceDraftId(null); }}
      onFallback={() => { setCameraOpen(false); window.setTimeout(() => cameraInputRef.current?.click(), 0); }}
      onCapture={(file) => { setCameraOpen(false); void acceptPhotos([file], "camera", replaceDraftId); }}
    />}
    <input ref={cameraInputRef} hidden type="file" accept="image/*" capture="user" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) void acceptPhotos([file], "camera", replaceDraftId);
      event.target.value = "";
    }} />
    <input ref={albumInputRef} hidden multiple type="file" accept="image/*" onChange={(event) => {
      void acceptPhotos(Array.from(event.target.files ?? []), "historical_import");
      event.target.value = "";
    }} />

    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">膚</span><div><b>肌膚追蹤</b><small>SKIN NOTES</small></div></div>
      <nav aria-label="主要功能">{nav.map(([id, label, icon]) =>
        <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>)}
      </nav>
      <div className="profile"><div className="avatar">{userName.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{userName}</b><small>{userEmail}</small></div></div>
    </aside>

    <section className="content">
      <header className="topbar"><div><p>自由建立專案、自由決定每天拍幾張</p><h1>{nav.find(([id]) => id === tab)?.[1]}</h1></div><div className="account-actions"><div className="account-chip"><span>{userName.slice(0, 1).toUpperCase()}</span><div><b>{userName}</b><small>{userEmail}</small></div></div><a className="privacy" href="/auth/signout">登出</a></div></header>
      {message && <div className="app-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
      {loading ? <section className="paper-card empty-history"><b>正在讀取你的資料…</b></section> : <>
        {tab === "home" && <Home projects={projects} photos={photos} select={(next) => { setTab(next); }} />}
        {(tab === "capture" || tab === "upload") && <CaptureWorkspace
          mode={tab}
          projects={projects}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          selectedProject={selectedProject}
          drafts={drafts}
          setDrafts={setDrafts}
          faceAngle={faceAngle}
          setFaceAngle={setFaceAngle}
          startCamera={startCamera}
          chooseAlbum={() => albumInputRef.current?.click()}
          saveDrafts={saveDrafts}
          saving={saving}
        />}
        {tab === "library" && <PhotoLibrary projects={projects} photos={photos} onDeleted={refresh} />}
        {tab === "compare" && <ComparePhotos projects={projects} photos={photos} />}
        {tab === "calendar" && <CalendarView photos={photos} journals={journals} />}
        {tab === "journal" && <JournalManager journals={journals} refresh={refresh} />}
        {tab === "projects" && <ProjectManager projects={projects} refresh={refresh} />}
      </>}
      <footer className="disclaimer">本工具用於個人保養追蹤，不代替專業醫療診斷。</footer>
    </section>
  </main>;
}

function Home({ projects, photos, select }: { projects: Project[]; photos: Photo[]; select: (tab: Tab) => void }) {
  const actions: Array<[Tab, string, string]> = [
    ["capture", "拍攝新照片", "自由連續拍攝，不限制張數"],
    ["upload", "上傳歷史照片", "可選多張並修改拍攝日期時間"],
    ["library", "查看照片庫", "依專案與日期篩選"],
    ["compare", "比較照片", "任選兩張照片並排查看"],
    ["journal", "每日保養日誌", "保留原有睡眠、壓力與文字紀錄"],
    ["projects", "管理專案", "建立自訂名稱與角度提示設定"],
  ];
  return <><section className="hero-card"><div className="hero-copy"><span className="eyebrow">多專案皮膚追蹤</span><h2>今天想拍幾張，由你決定</h2><p>先選擇追蹤專案，再自由拍攝或上傳照片。所有排序與比較都依實際拍攝日期時間。</p><button className="primary" onClick={() => select(projects.length ? "capture" : "projects")}>{projects.length ? "開始拍照" : "建立第一個專案"}</button></div><div className="home-stats"><b>{projects.length}</b><small>個追蹤專案</small><b>{photos.length}</b><small>張照片</small></div></section>
    <div className="action-grid">{actions.map(([tab, title, text]) => <button key={tab} onClick={() => select(tab)}><b>{title}</b><small>{text}</small></button>)}</div></>;
}

function CaptureWorkspace(props: {
  mode: "capture" | "upload";
  projects: Project[];
  selectedProjectId: string;
  setSelectedProjectId: (value: string) => void;
  selectedProject?: Project;
  drafts: Draft[];
  setDrafts: React.Dispatch<React.SetStateAction<Draft[]>>;
  faceAngle: FaceAngle;
  setFaceAngle: (value: FaceAngle) => void;
  startCamera: (replaceId?: string) => void;
  chooseAlbum: () => void;
  saveDrafts: () => void;
  saving: boolean;
}) {
  const historical = props.mode === "upload";
  return <section className="paper-card capture-workspace">
    <div className="section-title"><div><span className="eyebrow">{historical ? "相簿多選" : "自由連續拍攝"}</span><h2>{historical ? "上傳歷史照片" : "拍攝新照片"}</h2></div><span className="private-label">每張獨立保存</span></div>
    {!props.projects.length ? <div className="empty-history"><b>請先建立追蹤專案</b><p>專案名稱完全由你決定，且不限制每天照片數量。</p></div> : <>
      <label className="field">所屬專案<select value={props.selectedProjectId} onChange={(event) => props.setSelectedProjectId(event.target.value)}>{props.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
      {!historical && props.selectedProject?.enableFaceAngleGuidance && <div className="guidance-choice"><span>已啟用人臉角度提示</span>{FACE_ANGLES.map(([value, label]) => <button key={value} className={props.faceAngle === value ? "active" : ""} onClick={() => props.setFaceAngle(value)}>{label}</button>)}</div>}
      {!historical && props.selectedProject && !props.selectedProject.enableFaceAngleGuidance && <p className="soft-note">此專案未啟用人臉角度提示，將使用一般相機。</p>}
      <button className="primary" onClick={() => historical ? props.chooseAlbum() : props.startCamera()}>{historical ? "選擇一張或多張照片" : props.drafts.length ? "繼續拍攝" : "拍攝第一張"}</button>
      {historical && <p className="soft-note">系統會採用瀏覽器提供的照片時間作為建議；每張照片的日期與時間都可手動修改，上傳時間不會當作拍攝時間。</p>}
      <DraftList drafts={props.drafts} setDrafts={props.setDrafts} retake={historical ? undefined : props.startCamera} />
      {!!props.drafts.length && <div className="save-bar"><span>共 {props.drafts.length} 張，數量不受限制</span><button className="primary" disabled={props.saving} onClick={props.saveDrafts}>{props.saving ? "儲存中…" : "儲存並結束"}</button></div>}
    </>}
  </section>;
}

function DraftList({ drafts, setDrafts, retake }: { drafts: Draft[]; setDrafts: React.Dispatch<React.SetStateAction<Draft[]>>; retake?: (id: string) => void }) {
  function update(id: string, values: Partial<Draft>) {
    setDrafts((all) => all.map((draft) => draft.id === id ? { ...draft, ...values, captureTimeSource: values.capturedDate || values.capturedTime ? "manual" : draft.captureTimeSource } : draft));
  }
  function remove(id: string) {
    setDrafts((all) => {
      const target = all.find((draft) => draft.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return all.filter((draft) => draft.id !== id);
    });
  }
  return <div className="draft-list">{drafts.map((draft, index) => <article className="draft-card" key={draft.id}>
    <img src={draft.preview} alt={`待儲存第 ${index + 1} 張`} />
    <div><b>待儲存第 {index + 1} 張</b><p className="file-detail">{draft.originalName}・{draft.originalType}・{formatBytes(draft.originalSize)} → JPEG・{formatBytes(draft.file.size)}</p><div className="date-time-row"><label>拍攝日期<input type="date" value={draft.capturedDate} onChange={(event) => update(draft.id, { capturedDate: event.target.value })} /></label><label>拍攝時間<input type="time" value={draft.capturedTime} onChange={(event) => update(draft.id, { capturedTime: event.target.value })} /></label></div><label className="field">照片備註<textarea value={draft.note} onChange={(event) => update(draft.id, { note: event.target.value })} placeholder="可選填，每張照片各自保存" /></label><small>{draft.status || "已完成格式標準化，儲存前仍可修改"}</small><div className="draft-actions">{retake && <button onClick={() => retake(draft.id)}>重拍</button>}<button onClick={() => remove(draft.id)}>刪除</button></div></div>
  </article>)}</div>;
}

function ProjectManager({ projects, refresh }: { projects: Project[]; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [guidance, setGuidance] = useState(false);
  const [error, setError] = useState("");
  function reset(project?: Project) {
    setEditing(project ?? null); setName(project?.name ?? ""); setDescription(project?.description ?? "");
    setGuidance(project?.enableFaceAngleGuidance ?? false); setError("");
  }
  async function save() {
    const response = await fetch("/api/projects", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: editing?.id, name, description, enableFaceAngleGuidance: guidance }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) return setError(data.error || "儲存失敗");
    reset(); await refresh();
  }
  return <div className="project-layout"><section className="paper-card"><span className="eyebrow">{editing ? "編輯專案" : "新增專案"}</span><h2>{editing ? editing.name : "自由命名追蹤專案"}</h2><label className="field">專案名稱<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：A酸使用紀錄" /></label><label className="field">專案說明（選填）<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><label className="checkbox-field"><input type="checkbox" checked={guidance} onChange={(event) => setGuidance(event.target.checked)} /><span><b>啟用人臉角度拍攝提示</b><small>只影響即時拍照；預設不勾選，也不依專案名稱自動判斷。</small></span></label>{error && <p className="form-error">{error}</p>}<div className="button-row"><button className="primary" onClick={() => void save()}>儲存專案</button>{editing && <button onClick={() => reset()}>取消</button>}</div></section>
    <section className="paper-card"><span className="eyebrow">你的專案</span><h2>{projects.length} 個追蹤專案</h2><div className="project-list">{projects.map((project) => <article key={project.id}><div><b>{project.name}</b><p>{project.description || "沒有說明"}</p><small>{project.enableFaceAngleGuidance ? "✓ 已啟用人臉角度提示" : "一般拍照模式"}</small></div><button onClick={() => reset(project)}>編輯</button></article>)}</div></section></div>;
}

function PhotoLibrary({ projects, photos, onDeleted }: { projects: Project[]; photos: Photo[]; onDeleted: () => Promise<void> }) {
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [opened, setOpened] = useState<Photo | null>(null);
  const filtered = photos.filter((photo) => (!projectId || photo.projectId === projectId) && (!date || photo.capturedDate === date) && (!from || photo.capturedDate >= from) && (!to || photo.capturedDate <= to));
  async function remove(photo: Photo) {
    if (!window.confirm("確定刪除這張照片？此動作會刪除照片檔案。")) return;
    const response = await fetch(`/api/project-photos/${photo.id}`, { method: "DELETE" });
    if (response.ok) { setOpened(null); await onDeleted(); }
  }
  return <section className="paper-card photo-library"><div className="section-title"><div><span className="eyebrow">依實際拍攝時間排序</span><h2>照片庫</h2></div><span className="private-label">{filtered.length} 張</span></div><div className="filter-grid"><label>專案<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">全部專案</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>單一日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>起始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>結束日期<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><PhotoGrid photos={filtered} onOpen={setOpened} />
    {opened && <div className="photo-modal" role="dialog" aria-modal="true"><article><button className="modal-close" onClick={() => setOpened(null)}>×</button><img src={opened.url} alt={opened.projectName} /><h2>{opened.projectName}</h2><p>{opened.capturedDate}・{displayTime(opened)}・第 {opened.dailyNumber} 張</p><p>{SOURCE_LABEL[opened.photoSource]}・{opened.note || "沒有備註"}</p><button className="danger" onClick={() => void remove(opened)}>刪除照片</button></article></div>}
  </section>;
}

function PhotoGrid({ photos, onOpen }: { photos: Photo[]; onOpen?: (photo: Photo) => void }) {
  if (!photos.length) return <div className="empty-history"><b>沒有符合條件的照片</b></div>;
  return <div className="library-grid">{photos.map((photo) => <button key={photo.id} onClick={() => onOpen?.(photo)}><img src={photo.url} alt={`${photo.projectName} 第 ${photo.dailyNumber} 張`} loading="lazy" /><div><b>{photo.projectName}</b><span>{photo.capturedDate}・{displayTime(photo)}</span><small>第 {photo.dailyNumber} 張・{SOURCE_LABEL[photo.photoSource]}</small><p>{photo.note || "沒有備註"}</p></div></button>)}</div>;
}

function ComparePhotos({ projects, photos }: { projects: Project[]; photos: Photo[] }) {
  const [leftId, setLeftId] = useState<number | null>(photos[1]?.id ?? photos[0]?.id ?? null);
  const [rightId, setRightId] = useState<number | null>(photos[0]?.id ?? null);
  const left = photos.find((photo) => photo.id === leftId);
  const right = photos.find((photo) => photo.id === rightId);
  return <section className="paper-card compare-page"><div className="section-title"><div><span className="eyebrow">任選兩張照片</span><h2>照片比較</h2></div><span className="private-label">可跨專案與日期</span></div><div className="compare-pickers"><PhotoPicker label="左側／基準照片" projects={projects} photos={photos} value={leftId} onChange={setLeftId} /><PhotoPicker label="右側／對照照片" projects={projects} photos={photos} value={rightId} onChange={setRightId} /></div><div className="photo-compare-board free-compare">{[left, right].map((photo, index) => <article className="compare-photo-card" key={index}><header><span>{index ? "對照" : "基準"}</span><b>{photo ? `第 ${photo.dailyNumber} 張` : "尚未選擇"}</b></header><div className="compare-photo-frame">{photo ? <img src={photo.url} alt={photo.projectName} /> : <div>選擇照片</div>}</div>{photo && <div className="compare-caption"><b>{photo.projectName}</b><span>{photo.capturedDate}・{displayTime(photo)}</span></div>}</article>)}</div></section>;
}

function PhotoPicker({ label, projects, photos, value, onChange }: { label: string; projects: Project[]; photos: Photo[]; value: number | null; onChange: (id: number) => void }) {
  const [projectId, setProjectId] = useState("");
  const availableDates = [...new Set(photos.filter((photo) => !projectId || photo.projectId === projectId).map((photo) => photo.capturedDate))].sort().reverse();
  const [dateChoice, setDateChoice] = useState("");
  const date = availableDates.includes(dateChoice) ? dateChoice : availableDates[0] ?? "";
  const choices = photos.filter((photo) => (!projectId || photo.projectId === projectId) && photo.capturedDate === date).sort(sortCapturedAscending);
  return <div className="photo-picker"><b>{label}</b><label>1. 選擇專案<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setDateChoice(""); }}><option value="">全部專案</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>2. 選擇日期<select value={date} onChange={(event) => setDateChoice(event.target.value)}>{availableDates.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><span>3. 選擇當日照片</span><div className="picker-thumbs">{choices.map((photo) => <button key={photo.id} className={value === photo.id ? "active" : ""} onClick={() => onChange(photo.id)}><img src={photo.url} alt="" /><span>第 {photo.dailyNumber} 張<small>{displayTime(photo)}</small></span></button>)}</div></div>;
}

function CalendarView({ photos, journals }: { photos: Photo[]; journals: Journal[] }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(getLocalDateTime().date);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const dayPhotos = photos.filter((photo) => photo.capturedDate === selectedDate).sort(sortCapturedAscending);
  const journal = journals.find((item) => item.entryDate === selectedDate);
  return <section className="paper-card history-page"><div className="card-title calendar-toolbar"><div><span className="eyebrow">同一天可有任意張照片</span><h2>{year} 年 {month + 1} 月</h2></div><div className="month-actions"><button onClick={() => setCursor(new Date(year, month - 1, 1))}>← 上月</button><button onClick={() => setCursor(new Date(year, month + 1, 1))}>下月 →</button></div></div><div className="calendar-head">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: first }).map((_, index) => <i key={index} />)}{Array.from({ length: days }).map((_, index) => {
    const day = index + 1, key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = photos.filter((photo) => photo.capturedDate === key).length;
    const hasJournal = journals.some((item) => item.entryDate === key);
    return <button key={key} className={`${count || hasJournal ? "recorded" : ""} ${selectedDate === key ? "selected" : ""}`} onClick={() => setSelectedDate(key)}><span>{day}</span>{count ? <b>{count} 張照片</b> : null}{hasJournal ? <b className="journal-marker">有日誌</b> : null}{!count && !hasJournal ? <small>尚無紀錄</small> : null}</button>;
  })}</div><div className="day-detail"><div className="section-title"><div><span className="eyebrow">當日照片</span><h2>{selectedDate}</h2></div>{journal && <span className="private-label">含舊日誌資料</span>}</div>{journal && <div className="legacy-journal"><b>當日日誌</b><span>睡眠 {journal.sleep} 小時・壓力 {journal.stress}/5</span><p>{journal.note || "沒有備註"}</p></div>}<PhotoGrid photos={dayPhotos} /></div></section>;
}

function JournalManager({ journals, refresh }: { journals: Journal[]; refresh: () => Promise<void> }) {
  const [entryDate, setEntryDate] = useState(getLocalDateTime().date);
  const existing = journals.find((item) => item.entryDate === entryDate);
  return <section className="paper-card journal-editor">
    <div className="section-title"><div><span className="eyebrow">保留既有日誌功能</span><h2>每日保養日誌</h2></div>{existing && <span className="private-label">編輯既有紀錄</span>}</div>
    <label className="field">紀錄日期<input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label>
    <JournalForm key={`${entryDate}:${existing?.id ?? "new"}`} entryDate={entryDate} existing={existing} refresh={refresh} />
  </section>;
}

function JournalForm({ entryDate, existing, refresh }: { entryDate: string; existing?: Journal; refresh: () => Promise<void> }) {
  const [sleep, setSleep] = useState(String(existing?.sleep ?? 7));
  const [stress, setStress] = useState(String(existing?.stress ?? 2));
  const [note, setNote] = useState(existing?.note ?? "");
  const [status, setStatus] = useState("");

  async function save() {
    const sleepValue = Number(sleep), stressValue = Number(stress);
    if (sleep.trim() === "" || !Number.isFinite(sleepValue) || sleepValue < 0 || sleepValue > 24) return setStatus("睡眠時數請輸入 0 至 24");
    if (stress.trim() === "" || !Number.isFinite(stressValue) || stressValue < 0 || stressValue > 5) return setStatus("壓力程度請輸入 0 至 5");
    setStatus("儲存中…");
    let metrics: Record<string, unknown> = {};
    try { metrics = existing?.metrics ? JSON.parse(existing.metrics) as Record<string, unknown> : {}; } catch { metrics = {}; }
    const response = await fetch("/api/checkins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryDate, sleep: sleepValue, stress: stressValue, note, metrics }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) return setStatus(data.error || "日誌儲存失敗");
    await refresh();
    setStatus("✓ 日誌已儲存");
  }

  return <>
    <div className="date-time-row">
      <label>睡眠時數<input type="number" min="0" max="24" step=".5" value={sleep} onChange={(event) => setSleep(event.target.value)} /></label>
      <label>壓力程度（0–5）<input type="number" min="0" max="5" value={stress} onChange={(event) => setStress(event.target.value)} /></label>
    </div>
    <label className="field">當日備註<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="保養、作息或皮膚狀況" /></label>
    <div className="save-bar"><span>{status || "相同日期會安全更新原紀錄"}</span><button className="primary" onClick={() => void save()}>儲存日誌</button></div>
  </>;
}

function displayTime(photo: Photo) { return photo.captureTimeKnown && photo.capturedTime ? photo.capturedTime : "時間未知"; }
function sortCapturedAscending(a: Photo, b: Photo) { return (a.capturedTime ?? "99:99").localeCompare(b.capturedTime ?? "99:99") || a.id - b.id; }
function getLocalDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}
function suggestCaptureDateTime(file: File) {
  const candidate = file.lastModified > 0 ? new Date(file.lastModified) : new Date();
  const values = getLocalDateTime(candidate);
  return { ...values, source: file.lastModified > 0 ? "file_last_modified" : "manual" };
}

async function uploadPreparedPhoto(draft: Draft, projectId: string) {
  const traceId = crypto.randomUUID().slice(0, 8);
  if (draft.file.size > PHOTO_TARGET_BYTES) {
    throw new Error(`送出前檢查失敗（錯誤代碼 ${traceId}）：照片仍有 ${formatBytes(draft.file.size)}，超過 ${formatBytes(PHOTO_TARGET_BYTES)} 的安全上傳上限。`);
  }
  const body = new FormData();
  body.append("photo", draft.file);
  body.append("projectId", projectId);
  body.append("capturedDate", draft.capturedDate);
  body.append("capturedTime", draft.capturedTime);
  body.append("photoSource", draft.photoSource);
  body.append("captureTimeSource", draft.captureTimeSource);
  body.append("note", draft.note);
  body.append("traceId", traceId);
  let response: Response;
  try {
    response = await fetch("/api/project-photos", { method: "POST", body });
  } catch {
    throw new Error(`無法連線到照片伺服器（錯誤代碼 ${traceId}）。請確認網路後重試。`);
  }
  const raw = await response.text();
  let serverError = "";
  try { serverError = (JSON.parse(raw) as { error?: string }).error ?? ""; } catch { serverError = raw.slice(0, 180); }
  if (!response.ok) {
    throw new Error(`上傳失敗（HTTP ${response.status}，錯誤代碼 ${traceId}）：${serverError || response.statusText || "伺服器沒有回傳詳細訊息"}`);
  }
}

async function preparePhotoForUpload(original: File) {
  if (!isSupportedImageFile(original)) throw new Error("請選擇照片檔案");
  const file = await convertHeicToJpeg(original);
  const image = await loadPhotoImage(file);
  try {
    let width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height) throw new Error("照片尺寸無法辨識");
    const longest = Math.max(width, height);
    if (longest > PHOTO_MAX_DIMENSION) { const ratio = PHOTO_MAX_DIMENSION / longest; width = Math.round(width * ratio); height = Math.round(height * ratio); }
    let compressed: Blob | null = null;
    for (let attempt = 0; attempt < PHOTO_MAX_COMPRESSION_ATTEMPTS; attempt += 1) {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("瀏覽器無法處理照片");
      context.drawImage(image, 0, 0, width, height);
      compressed = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("照片壓縮失敗")), "image/jpeg", Math.max(.45, .82 - attempt * .08)));
      if (compressed.size <= PHOTO_TARGET_BYTES) break;
      width = Math.round(width * .78); height = Math.round(height * .78);
    }
    if (!compressed || compressed.size > PHOTO_TARGET_BYTES) {
      throw new Error(`照片壓縮後仍有 ${compressed ? formatBytes(compressed.size) : "未知大小"}，無法降到 ${formatBytes(PHOTO_TARGET_BYTES)} 以下。`);
    }
    return new File([compressed], `${original.name.replace(/\.[^.]+$/, "") || "skin-photo"}.jpg`, {
      type: "image/jpeg",
      lastModified: original.lastModified,
    });
  } finally { URL.revokeObjectURL(image.src); }
}

function isSupportedImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
}

async function convertHeicToJpeg(file: File) {
  if (!/heic|heif/i.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) return file;
  if (await browserCanDecode(file)) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: .92 });
    const blob = Array.isArray(result) ? result[0] : result;
    return new File([blob], `${file.name.replace(/\.(heic|heif)$/i, "") || "skin-photo"}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "轉檔工具無回應";
    throw new Error(`HEIC 轉成 JPEG 失敗：${detail}`);
  }
}

async function browserCanDecode(file: File) {
  try {
    const image = await loadPhotoImage(file);
    URL.revokeObjectURL(image.src);
    return image.naturalWidth > 0 && image.naturalHeight > 0;
  } catch {
    return false;
  }
}

function loadPhotoImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      reject(new Error("無法讀取照片格式，請改選 JPG、PNG、WebP 或 HEIC 照片。"));
    };
    image.src = URL.createObjectURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
