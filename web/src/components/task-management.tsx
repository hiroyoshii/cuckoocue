"use client";

import { useSyncExternalStore } from "react";
import { ArrowUpRight, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// Set the public distribution URLs when each app is released, then rebuild.
const platforms = [
  { id: "android", name: "Android", store: "Google Play", url: process.env.NEXT_PUBLIC_ANDROID_APP_URL ?? "" },
  { id: "ios", name: "iOS", store: "App Store", url: process.env.NEXT_PUBLIC_IOS_APP_URL ?? "" },
];

function distributionUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; }
  catch { return null; }
}

const subscribeDevice = () => () => {};
function getDevice() {
  const ua = navigator.userAgent;
  return /android/i.test(ua) ? "android" : /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : null;
}

export function TaskManagement() {
  const device = useSyncExternalStore(subscribeDevice, getDevice, () => null);
  const ordered = [...platforms].sort((a, b) => Number(b.id === device) - Number(a.id === device));

  return <div className="workspace task-management">
    <header className="workspace-heading">
      <h1>タスク管理</h1>
      <p className="app-download-description">タスクの管理には、スマホアプリをご利用ください。</p>
    </header>
    <section className="app-downloads" aria-label="アプリのダウンロード">
      {ordered.map(platform => {
        const url = distributionUrl(platform.url);
        return <article className="app-platform" key={platform.id}>
          <div className="app-platform-heading"><Smartphone size={22} aria-hidden="true" /><h2>{platform.name}</h2>{device === platform.id ? <span>この端末向け</span> : null}</div>
          {url ? <>
            <a className="primary-action" href={url} target="_blank" rel="noopener noreferrer">{platform.store}でダウンロード<ArrowUpRight size={17} aria-hidden="true" /></a>
            {!device ? <figure className="app-download-qr"><QRCodeSVG value={url} size={112} marginSize={4} title={`${platform.name}のダウンロードURL`} /><figcaption>スマホで読み取る</figcaption></figure> : null}
          </> : <><button className="secondary-action" disabled>{platform.store} · 準備中</button><p className="app-release-note">公開後、ここからダウンロードできます。</p></>}
        </article>;
      })}
    </section>
  </div>;
}
