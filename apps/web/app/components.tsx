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
  return (
    <div className="qr">
      {src ? <img src={src} alt={label} width={260} height={260} /> : <div className="muted">Generating QR…</div>}
      <button className="btn ghost small" onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? "Copied" : "Copy as text (fallback)"}
      </button>
    </div>
  );
}

/** Camera QR scanner (jsQR) with a paste fallback. */
export function Scanner({ onResult, prompt }: { onResult: (text: string) => void; prompt: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
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

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({ error: "BadResponse" }));
  return j as T;
}

export const ERROR_TEXT: Record<string, string> = {
  InvoiceUsed: "This invoice has already been paid. The contract refused a second charge.",
  InsufficientFunds: "The family balance is not enough for this purchase.",
  KeyNotActive: "This phone's key is not registered (or was revoked) for that family.",
  InvoiceExpired: "The invoice expired. Create a new one and ask for a new approval.",
  BadSignature: "The approval signature is not valid for these exact payment details.",
  FamilyNotFound: "That family does not exist on this vault.",
  NOT_CONFIGURED: "The server is missing its Testnet demo signer configuration.",
};
