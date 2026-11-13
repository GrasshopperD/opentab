"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { EXPLORER_TX } from "@/lib/config";

export function QR({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 2, width: 320 }).then(setSrc).catch(() => setSrc(""));
  }, [value]);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <div className="qr">
      {src ? <img src={src} alt={label} width={260} height={260} /> : <div className="muted">Generating QR…</div>}
      <button className="btn ghost small" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setCopied(false); setShow(true); }
        setTimeout(() => setCopied(false), 1500);
      }}>
        {copied ? "Copied" : "Copy as text (fallback)"}
      </button>
      <details open={show} onToggle={(e) => setShow((e.target as HTMLDetailsElement).open)}>
        <summary>Show code as text</summary>
        <textarea readOnly rows={4} value={value} data-testid="qr-text" onFocus={(e) => e.currentTarget.select()} />
      </details>
    </div>
  );
}

/** Camera QR scanner (jsQR) with a paste fallback. `autoStart` opens the camera as soon as the scanner is shown
 *  (used right after the user taps "Scan to Pay"); if the camera is unavailable the paste fallback remains. */
export function Scanner({ onResult, prompt, autoStart = false }: { onResult: (text: string) => void; prompt: string; autoStart?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(autoStart);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null, raf = 0, stopped = false;
    const canvas = document.createElement("canvas");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const v = video.current!; v.srcObject = stream; v.setAttribute("playsinline", "true"); await v.play();
        const tick = () => {
          if (stopped) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code?.data) { setOn(false); onResult(code.data); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e: any) { setErr("Camera unavailable: " + (e?.message ?? e) + ". Paste the code below instead."); setOn(false); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, onResult]);
  return (
    <div className="scanner">
      {on ? <video ref={video} className="video" muted /> : null}
      <button className="btn" onClick={() => setOn(!on)}>{on ? "Stop camera" : prompt}</button>
      {err && <p className="warn">{err}</p>}
      <details>
        <summary>Paste code instead</summary>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="OTI1:… / OTA1:… / OTK1:…" />
        <button className="btn ghost small" onClick={() => text.trim() && onResult(text.trim())}>Use pasted code</button>
      </details>
    </div>
  );
}

export function TxLink({ hash }: { hash?: string }) {
  if (!hash) return null;
  return <a className="txlink" href={EXPLORER_TX + hash} target="_blank" rel="noreferrer">View on Stellar Expert ↗ <code>{hash.slice(0, 10)}…{hash.slice(-6)}</code></a>;
}

export function Online() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const u = () => setOnline(navigator.onLine); u();
    window.addEventListener("online", u); window.addEventListener("offline", u);
    return () => { window.removeEventListener("online", u); window.removeEventListener("offline", u); };
  }, []);
  return <span className={"pill " + (online ? "ok" : "off")}>{online ? "Online" : "Offline"}</span>;
}

/** Never throws: network failures come back as { error: "NetworkError" } so the UI can recover. */
export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { ...init, credentials: "same-origin", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    return { error: "NetworkError", detail: "No connection to the server." } as T;
  }
  const j = await r.json().catch(() => ({ error: "BadResponse", detail: `HTTP ${r.status}` }));
  return j as T;
}

/** Demo access gate for screens that operate server-held Testnet accounts. */
export function DemoAccess({ onChange }: { onChange?: (ok: boolean) => void }) {
  const [state, setState] = useState<{ authorized: boolean; enabled: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    api("/api/auth/status").then((s: any) => { if (!s.error) { setState(s); onChange?.(s.authorized); } });
  }, [onChange]);
  if (!state) return null;
  if (!state.enabled) return <div className="status bad">Interactive demo is disabled on this deployment. Evidence links still work.</div>;
  if (state.authorized) return (
    <p className="muted">Demo operator access active. <button className="linkbtn" onClick={async () => {
      await api("/api/auth/logout", { method: "POST", body: "{}" }); setState({ ...state, authorized: false }); onChange?.(false);
    }}>Sign out</button></p>
  );
  return (
    <div className="card">
      <h2>Demo operator access</h2>
      <p className="muted">This screen spends from demo Testnet accounts, so it needs the access code given to demonstrators and judges.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setErr("");
        const r: any = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ code }) });
        if (r.authorized) { setState({ ...state, authorized: true }); onChange?.(true); setCode(""); } else setErr(r.detail ?? r.error);
      }}>
        <label htmlFor="democode">Access code</label>
        <input id="democode" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn" type="submit" disabled={!code}>Unlock demo</button>
      </form>
      {err && <p className="warn">{err}</p>}
    </div>
  );
}

export const ERROR_TEXT: Record<string, string> = {
  InvoiceUsed: "This invoice has already been paid. The contract refused a second charge.",
  InsufficientFunds: "The family balance is not enough for this purchase.",
  KeyNotActive: "This phone's key is not registered (or was revoked) for that family.",
  InvoiceExpired: "The invoice expired. Create a new one and ask for a new approval.",
  BadSignature: "The approval signature is not valid for these exact payment details.",
  FamilyNotFound: "That family does not exist on this vault.",
  NOT_CONFIGURED: "The server is missing its Testnet demo signer configuration.",
  NetworkError: "No connection to the server. Nothing was charged by this attempt unless the status check says so.",
  Unauthorized: "Demo access code required (unlock at the top of the page).",
  RateLimited: "Too many requests. Wait a minute and try again.",
  InFlight: "This invoice is already being submitted. Wait for the result.",
  DemoLocked: "Interactive demo is disabled on this deployment.",
};
