"use client";

import { Check, LogOut, UserRound } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { User } from "firebase/auth";

export type AccountControlProps = {
  user: User | null;
  ready: boolean;
  busy: "login" | "logout" | null;
  error: string | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onLogin: () => void;
  onLogout: () => void;
  compact?: boolean;
};

export function AccountControl({ user, ready, busy, error, open, onToggle, onClose, onLogin, onLogout, compact }: AccountControlProps) {
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
      <button type="button" role="menuitem" disabled={!ready || !!busy} onClick={account ? onLogout : onLogin}>
        {account ? <LogOut size={17} aria-hidden="true" /> : <UserRound size={17} aria-hidden="true" />}
        {!ready ? "確認中" : busy === "login" ? "ログイン中" : busy === "logout" ? "ログアウト中" : account ? "ログアウト" : "ログイン"}
      </button>
    </div> : null}
  </div>;
}
