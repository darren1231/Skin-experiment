"use client";
/* eslint-disable @next/next/no-img-element -- authenticated photos and camera previews use dynamic URLs */

import { useEffect, useMemo, useRef, useState } from "react";

type Metric = { key: string; label: string; value: number; color: string };
type MetricValues = Record<string, number>;
type RecordRow = {
  id: number;
  entryDate: string;
  metrics: string;
  sleep: number;
  stress: number;
  note: string;
  wholeRoutine: string;
  leftRoutine: string;
  rightRoutine: string;
  createdAt: string;
  updatedAt: string;
};
type PhotoRow = { id: number; entryDate: string; angle: "front" | "left" | "right"; createdAt?: string };
type UploadStatus = { state: "idle" | "uploading" | "saved" | "error"; message?: string };

const PHOTO_TARGET_BYTES = 1.8 * 1024 * 1024;
const PHOTO_MAX_COMPRESSION_ATTEMPTS = 4;
const PHOTO_MAX_DIMENSION = 2048;
const angles = [["front", "正面"], ["left", "左側 45°"], ["right", "右側 45°"]] as const;
const metricNames: Record<string, string> = { acne: "痘痘", redness: "泛紅", dryness: "乾燥", oil: "出油", sensitivity: "敏感" };
const initialMetrics: Metric[] = [
  { key: "acne", label: "痘痘", value: 2, color: "#d56b5e" },
  { key: "redness", label: "泛紅", value: 3, color: "#e49b78" },
  { key: "dryness", label: "乾燥", value: 1, color: "#789ca6" },
  { key: "oil", label: "出油", value: 2, color: "#d1a04e" },
  { key: "sensitivity", label: "敏感", value: 1, color: "#9d83a8" },
];
const demoTrend = [3.8, 3.5, 3.6, 3.1, 2.8, 2.6, 2.3];

export default function Dashboard({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [active, setActive] = useState("today");
  const [step, setStep] = useState(0);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadStatus>>({});
  const [note, setNote] = useState("");
  const [sleep, setSleep] = useState(7);
  const [stress, setStress] = useState(2);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [photoRows, setPhotoRows] = useState<PhotoRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoAngle, setPhotoAngle] = useState<PhotoRow["angle"]>("front");
  const todayKey = getTaipeiDateKey();

  useEffect(() => {
    fetch("/api/checkins")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("讀取失敗")))
      .then((data) => { setRecords(data.records ?? []); setPhotoRows(data.photos ?? []); })
      .catch(() => setSaveError("暫時無法讀取過往紀錄，請重新整理後再試。"));
  }, []);

  const overall = useMemo(() => (metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length).toFixed(1), [metrics]);
  const uploading = Object.values(uploadStatus).some((status) => status.state === "uploading");

  function choosePhoto(angle: PhotoRow["angle"]) {
    setPhotoAngle(angle);
    inputRef.current?.click();
  }

  async function onPhoto(file?: File) {
    if (!file) return;
    const angle = photoAngle;
    setUploadStatus((current) => ({ ...current, [angle]: { state: "uploading", message: file.size > PHOTO_TARGET_BYTES ? "正在縮小照片…" : "上傳中…" } }));
    try {
      const uploadFile = await compressPhoto(file);
      const previewUrl = URL.createObjectURL(uploadFile);
      setPreviews((current) => {
        if (current[angle]) URL.revokeObjectURL(current[angle]);
        return { ...current, [angle]: previewUrl };
      });
      setUploadStatus((current) => ({ ...current, [angle]: { state: "uploading", message: "上傳中…" } }));

      const body = new FormData();
      body.append("photo", uploadFile);
      body.append("angle", angle);
      body.append("entryDate", todayKey);
      const response = await fetch("/api/photos", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.photo) throw new Error(data.error || "上傳失敗");
      const stored: PhotoRow = data.photo;
      setPhotoRows((current) => [stored, ...current.filter((photo) => !(photo.entryDate === todayKey && photo.angle === angle))]);
      setUploadStatus((current) => ({ ...current, [angle]: { state: "saved" } }));
    } catch (error) {
      setUploadStatus((current) => ({ ...current, [angle]: { state: "error", message: error instanceof Error ? error.message : "上傳失敗" } }));
    }
  }

  async function saveCheckin() {
    if (uploading) return;
    setSaving(true);
    setSaveError("");
    const payload = {
      entryDate: todayKey,
      metrics: Object.fromEntries(metrics.map((metric) => [metric.key, metric.value])),
      sleep, stress, note,
      wholeRoutine: "溫和潔面、保濕、白天防曬",
      leftRoutine: "菸鹼醯胺 5%",
      rightRoutine: "維他命 C 8%",
    };
    try {
      const response = await fetch("/api/checkins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.record) throw new Error(data.error || "儲存失敗");
      setRecords((current) => [data.record, ...current.filter((record) => record.entryDate !== payload.entryDate)]);
      setSaved(true);
      setStep(0);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">膚</span><div><b>每日肌膚</b><small>SKIN NOTES</small></div></div>
      <nav aria-label="主要功能">
        {[["today", "今日紀錄", "●"], ["experiment", "左右臉實驗", "◐"], ["trends", "日期比較", "⇄"], ["history", "歷史日誌", "▤"]].map(([id, label, icon]) =>
          <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><span>{icon}</span>{label}</button>)}
      </nav>
      <div className="sidebar-note"><span>你的資料</span><b>照片與紀錄依 Google 帳號分開保存</b><div className="mini-progress"><i /></div><small>只有你登入後可以查看</small></div>
      <div className="profile"><div className="avatar">{userName.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{userName}</b><small>{userEmail}</small><em>Google 帳號已登入</em></div></div>
    </aside>

    <section className="content">
      <header className="topbar"><div><p>{new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Taipei" }).format(new Date())}</p><h1>{active === "today" ? "今天，記錄你的肌膚" : active === "experiment" ? "左右臉保養實驗" : active === "trends" ? "任意兩天比較" : "每日拍攝回顧"}</h1></div><div className="account-actions"><div className="account-chip" title={`目前登入：${userEmail}`}><span>{userName.slice(0, 1).toUpperCase()}</span><div><b>{userName}</b><small>{userEmail}</small></div></div><a className="privacy" href="/auth/signout">登出</a></div></header>

      {active === "today" && <>
        <section className="hero-card"><div className="hero-copy"><span className="eyebrow">每日 3 分鐘紀錄</span><h2>{saved ? "今天的紀錄已保存" : "固定角度拍照，才能看見真正變化"}</h2><p>{saved ? "你可以到歷史日誌點選今天，或到日期比較與任意一天並排查看。" : "拍攝正面與左右側，記錄肌膚分數與今天做過的保養。照片成功傳到後端才會顯示安全保存。"}</p><button className="primary" onClick={() => { setSaved(false); setStep(step ? 0 : 1); }}>{saved ? "再看一次" : step ? "收起紀錄" : "開始今日紀錄"}</button></div><div className="face-orbit"><div className="face-shape"><span /><i /></div><div className="orbit-tag one">正面</div><div className="orbit-tag two">左側</div><div className="orbit-tag three">右側</div></div></section>

        {step > 0 && <section className="checkin-panel">
          <div className="step-head"><div><span className="eyebrow">今日紀錄</span><h2>拍攝照片並記下今天的狀況</h2></div><div className="step-dots"><i className="on" /><i /><i /></div></div>
          <input ref={inputRef} hidden type="file" accept="image/*" capture="user" onChange={(event) => { void onPhoto(event.target.files?.[0]); event.target.value = ""; }} />
          <div className="photo-grid">{angles.map(([id, label]) => {
            const status = uploadStatus[id];
            return <button key={id} onClick={() => choosePhoto(id)} className={previews[id] ? "has-photo" : ""}>
              {previews[id] ? <img src={previews[id]} alt={`${label}拍攝預覽`} /> : <><span className="camera">◎</span><b>{label}</b><small>對齊輪廓拍攝</small></>}
              {status?.state === "uploading" && <span className="upload-status uploading">{status.message ?? "上傳中…"}</span>}
              {status?.state === "saved" && <span className="upload-status saved">✓ 已安全保存</span>}
              {status?.state === "error" && <span className="upload-status error" title={status.message}>上傳失敗・請重拍</span>}
            </button>;
          })}</div>
          <div className="form-grid"><div className="metric-card"><h3>今天的肌膚狀況</h3><p>0 代表沒有，5 代表最明顯</p>{metrics.map((metric) => <label className="metric-row" key={metric.key}><span><i style={{ background: metric.color }} />{metric.label}</span><output>{metric.value}</output><input aria-label={metric.label} type="range" min="0" max="5" value={metric.value} onChange={(event) => setMetrics((all) => all.map((item) => item.key === metric.key ? { ...item, value: Number(event.target.value) } : item))} /></label>)}</div>
            <div className="life-card"><h3>生活與保養備註</h3><label>睡眠時間 <b>{sleep} 小時</b><input type="range" min="0" max="12" value={sleep} onChange={(event) => setSleep(Number(event.target.value))} /></label><label>今日壓力 <b>{stress} / 5</b><input type="range" min="0" max="5" value={stress} onChange={(event) => setStress(Number(event.target.value))} /></label><label>做了什麼改變<textarea placeholder="例如：晚上開始使用新的保濕精華" value={note} onChange={(event) => setNote(event.target.value)} /></label>{saveError && <p className="form-error">{saveError}</p>}<button className="primary wide" disabled={saving || uploading} onClick={saveCheckin}>{uploading ? "等待照片上傳…" : saving ? "儲存中…" : "安全保存今日紀錄"}</button></div>
          </div>
        </section>}

        <div className="overview-grid"><section className="status-card"><div className="card-title"><div><span className="eyebrow">後續回顧</span><h3>日曆與日期比較</h3></div><button onClick={() => setActive("history")}>查看</button></div><div className="split-face"><div><small>歷史日誌</small><b>點選任意日期</b><span className="good">照片＋完整紀錄</span></div><div className="divider"><i>與</i></div><div><small>日期比較</small><b>選擇任意兩天</b><span>分數差異一目了然</span></div></div><footer><span>資料僅你可見</span><span>{records.length} 天紀錄</span></footer></section><section className="score-card"><span className="eyebrow">今日平均分數</span><div className="score"><b>{overall}</b><span>/ 5<small>越低越穩定</small></span></div><div className="spark">{demoTrend.map((value, index) => <i key={index} style={{ height: `${value * 16}px` }} />)}</div><p>持續使用相同光線與角度拍照，會更容易比較。</p></section></div>
      </>}

      {active === "experiment" && <ExperimentView />}
      {active === "trends" && <CompareView records={records} photos={photoRows} />}
      {active === "history" && <HistoryView records={records} photos={photoRows} />}
      <footer className="disclaimer">本工具用於個人保養追蹤，不代替專業醫療診斷。若皮膚持續不適，請諮詢皮膚科醫師。</footer>
    </section>
  </main>;
}

function ExperimentView() {
  return <div className="page-grid"><section className="paper-card wide-card"><span className="eyebrow">左右臉對照</span><h2>菸鹼醯胺 vs. 維他命 C</h2><p className="muted">在相同基礎保養下，左右臉各使用一種產品。連續記錄並透過日期比較查看變化。</p><div className="routine-table"><div className="routine common"><span>全臉共同</span><b>溫和潔面、保濕、白天 SPF50 防曬</b></div><div className="routine left"><span>左臉保養</span><b>菸鹼醯胺 5%</b><small>每天 2 滴</small></div><div className="routine right"><span>右臉保養</span><b>維他命 C 8%</b><small>每天 2 滴</small></div></div></section><section className="paper-card"><span className="eyebrow">判讀建議</span><div className="winner">至少 14 天</div><h3>先觀察趨勢，再下結論</h3><p>睡眠、壓力與光線都可能影響外觀，請同時查看每日紀錄。</p></section><section className="paper-card"><span className="eyebrow">拍攝品質</span><div className="quality">固定<small>光線與角度</small></div><p>盡量在相同時段、同一位置拍攝，避免濾鏡與美肌功能。</p></section></div>;
}

function CompareView({ records, photos }: { records: RecordRow[]; photos: PhotoRow[] }) {
  const dates = useMemo(() => [...new Set(records.map((record) => record.entryDate))].sort(), [records]);
  const [fromChoice, setFromChoice] = useState("");
  const [toChoice, setToChoice] = useState("");
  const fromDate = fromChoice && dates.includes(fromChoice) ? fromChoice : dates.at(-2) ?? dates[0] ?? "";
  const toDate = toChoice && dates.includes(toChoice) ? toChoice : dates.at(-1) ?? "";
  const from = records.find((record) => record.entryDate === fromDate);
  const to = records.find((record) => record.entryDate === toDate);

  if (dates.length < 2) return <section className="paper-card empty-history"><b>至少需要兩天紀錄才能比較</b><p>完成兩次不同日期的每日紀錄後，就能選擇任意兩天並排查看。</p></section>;
  return <section className="paper-card compare-page">
    <div className="card-title"><div><span className="eyebrow">任意日期比較</span><h2>看看兩天之間改變了什麼</h2></div><span className="private-label">僅你可見</span></div>
    <div className="compare-controls"><label>較早／基準日期<select aria-label="基準日期" value={fromDate} onChange={(event) => setFromChoice(event.target.value)}>{dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}</select></label><span>比較</span><label>較晚／對照日期<select aria-label="對照日期" value={toDate} onChange={(event) => setToChoice(event.target.value)}>{dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}</select></label></div>
    {fromDate === toDate && <p className="compare-warning">目前選到同一天，請選擇兩個不同日期查看變化。</p>}
    {from && to && <><div className="compare-grid"><DaySnapshot title="基準" record={from} photos={photos} /><DaySnapshot title="對照" record={to} photos={photos} /></div><MetricComparison from={from} to={to} /></>}
  </section>;
}

function HistoryView({ records, photos }: { records: RecordRow[]; photos: PhotoRow[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(getTaipeiDateKey());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const byDate = new Map(records.map((record) => [record.entryDate, record]));
  const selectedRecord = byDate.get(selectedDate);

  return <section className="paper-card history-page">
    <div className="card-title calendar-toolbar"><div><span className="eyebrow">每日紀錄</span><h2>{year} 年 {month + 1} 月</h2></div><div className="month-actions"><button aria-label="上一個月" onClick={() => setCursor(new Date(year, month - 1, 1))}>← 上月</button><button aria-label="下一個月" onClick={() => setCursor(new Date(year, month + 1, 1))}>下月 →</button><span className="private-label">僅你可見</span></div></div>
    <div className="calendar-head">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">{Array.from({ length: first }).map((_, index) => <i key={`blank-${index}`} />)}{Array.from({ length: days }).map((_, index) => {
      const day = index + 1;
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const record = byDate.get(key);
      return <button key={key} onClick={() => setSelectedDate(key)} className={`${record ? "recorded" : ""} ${selectedDate === key ? "selected" : ""}`}><span>{day}</span>{record ? <><b>已記錄</b><small>{record.note || "查看當日狀況"}</small></> : <small>尚無紀錄</small>}</button>;
    })}</div>
    <div className="day-detail"><div className="day-detail-title"><div><span className="eyebrow">你選擇的日期</span><h2>{formatDate(selectedDate)}</h2></div>{selectedRecord && <span className="private-label">已安全保存</span>}</div>{selectedRecord ? <DaySnapshot record={selectedRecord} photos={photos} /> : <div className="empty-history"><b>這一天沒有紀錄</b><p>請點選日曆中標示「已記錄」的日期，即可調閱照片、分數與當天做過的改變。</p></div>}</div>
  </section>;
}

function DaySnapshot({ record, photos, title }: { record: RecordRow; photos: PhotoRow[]; title?: string }) {
  const values = parseMetrics(record.metrics);
  return <article className="day-snapshot">{title && <span className="snapshot-label">{title}</span>}<h3>{formatDate(record.entryDate)}</h3><div className="day-photo-grid">{angles.map(([angle, label]) => {
    const photo = latestPhoto(photos, record.entryDate, angle);
    return <div className="day-photo" key={angle}>{photo ? <img src={`/api/photos/${photo.id}`} alt={`${record.entryDate} ${label}`} loading="lazy" /> : <span>沒有{label}照片</span>}<small>{label}</small></div>;
  })}</div><div className="metric-chips">{Object.entries(metricNames).map(([key, label]) => <div className="metric-chip" key={key}><span>{label}</span><b>{values[key] ?? 0}<small>/5</small></b></div>)}</div><dl className="record-facts"><div><dt>睡眠</dt><dd>{record.sleep ?? 0} 小時</dd></div><div><dt>壓力</dt><dd>{record.stress ?? 0} / 5</dd></div><div><dt>全臉保養</dt><dd>{record.wholeRoutine || "未記錄"}</dd></div><div><dt>左臉</dt><dd>{record.leftRoutine || "未記錄"}</dd></div><div><dt>右臉</dt><dd>{record.rightRoutine || "未記錄"}</dd></div><div className="full"><dt>當天改變／備註</dt><dd>{record.note || "沒有備註"}</dd></div></dl></article>;
}

function MetricComparison({ from, to }: { from: RecordRow; to: RecordRow }) {
  const first = parseMetrics(from.metrics);
  const second = parseMetrics(to.metrics);
  return <div className="comparison-table"><div className="comparison-row heading"><b>肌膚項目</b><b>{from.entryDate}</b><b>{to.entryDate}</b><b>變化</b></div>{Object.entries(metricNames).map(([key, label]) => {
    const before = first[key] ?? 0;
    const after = second[key] ?? 0;
    const delta = after - before;
    return <div className="comparison-row" key={key}><b>{label}</b><span>{before}</span><span>{after}</span><strong className={delta < 0 ? "good" : delta > 0 ? "bad" : "stable"}>{delta > 0 ? `+${delta}` : delta === 0 ? "不變" : delta}</strong></div>;
  })}<p>分數越低代表症狀越不明顯；負值表示相較基準日下降。</p></div>;
}

function parseMetrics(raw: string): MetricValues {
  try { return JSON.parse(raw || "{}") as MetricValues; } catch { return {}; }
}

function latestPhoto(photos: PhotoRow[], date: string, angle: PhotoRow["angle"]) {
  return photos.find((photo) => photo.entryDate === date && photo.angle === angle);
}

async function compressPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("請選擇照片檔案");
  if (file.size <= PHOTO_TARGET_BYTES) return file;

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const longestSide = Math.max(width, height);
    if (longestSide > PHOTO_MAX_DIMENSION) {
      const ratio = PHOTO_MAX_DIMENSION / longestSide;
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    let compressed: Blob | null = null;
    for (let attempt = 0; attempt < PHOTO_MAX_COMPRESSION_ATTEMPTS; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("瀏覽器無法處理這張照片");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.58, 0.86 - attempt * 0.09);
      compressed = await canvasToBlob(canvas, quality);
      if (compressed.size <= PHOTO_TARGET_BYTES) break;
      width = Math.round(width * 0.82);
      height = Math.round(height * 0.82);
    }

    if (!compressed || compressed.size > PHOTO_TARGET_BYTES) {
      throw new Error("照片縮小後仍然太大，請改用較低解析度重新拍攝");
    }
    return new File([compressed], `${file.name.replace(/\.[^.]+$/, "") || "skin-photo"}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("照片壓縮失敗，請重新拍攝")), "image/jpeg", quality);
  });
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric" }).format(new Date(year, month - 1, day));
}

function getTaipeiDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
