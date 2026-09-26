"use client";

import { Apple, Check, LogOut, Trash2, UserRound } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { User } from "firebase/auth";

export type AccountControlProps = {
  user: User | null;
  ready: boolean;
  busy: "login" | "logout" | "delete" | null;
  error: string | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onGoogleLogin: () => void;
  onAppleLogin: () => void;
  onLogout: () => void;
  onDelete: () => void;
  compact?: boolean;
};

export function AccountControl({ user, ready, busy, error, open, onToggle, onClose, onGoogleLogin, onAppleLogin, onLogout, onDelete, compact }: AccountControlProps) {
  const account = user && !user.isAnonymous ? user : null;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) onClose(); }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { onClose(); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open, onClose, ready, busy]);
  return <div ref={root} className={`account-control${compact ? " compact" : ""}`} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) onClose();
  }}>
    <button ref={trigger} type="button" disabled={!ready} className={`account-trigger${account ? " signed-in" : ""}`}
      aria-label={account ? `ログイン中: ${account.email ?? account.displayName ?? "アカウント"}` : "アカウント"}
      title={account ? "アカウント" : "ログイン"} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={onToggle}>
      {account ? <span>{Array.from(account.displayName?.trim() || account.email || "U")[0].toLocaleUpperCase()}</span> : <UserRound size={18} aria-hidden="true" />}
      {account ? <span className="account-check"><Check size={12} aria-hidden="true" /></span> : null}
    </button>
    {open ? <div ref={menu} id={id} className="account-menu" role="menu" aria-label="アカウント" onKeyDown={event => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      }
    }}>
      <header><strong>{account?.displayName || (account ? "ログイン中" : "アカウント")}</strong>{account?.email ? <span>{account.email}</span> : null}</header>
      {error ? <p role="alert" className="account-error">{error}</p> : null}
      {account ? <>
        <button type="button" role="menuitem" disabled={!ready || !!busy} onClick={onLogout}><LogOut size={17} aria-hidden="true" />{busy === "logout" ? "ログアウト中" : "ログアウト"}</button>
        <button type="button" role="menuitem" className="danger" disabled={!ready || !!busy} onClick={onDelete}><Trash2 size={17} aria-hidden="true" />{busy === "delete" ? "削除中" : "アカウントを削除"}</button>
      </> : <>
        <button type="button" role="menuitem" disabled={!ready || !!busy} onClick={onGoogleLogin}><UserRound size={17} aria-hidden="true" />{busy === "login" ? "ログイン中" : "Googleでログイン"}</button>
        <button type="button" role="menuitem" disabled={!ready || !!busy} onClick={onAppleLogin}><Apple size={17} aria-hidden="true" />Appleでログイン</button>
      </>}
      <div className="account-links"><a href="/privacy">プライバシー</a><a href="/terms">利用規約</a><a href="/support">サポート</a></div>
    </div> : null}
  </div>;
}
