"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, WandSparkles } from "lucide-react";
import { cueApiFetch } from "@/lib/api-client";
import type { ShelfDescription, ShelfDescriptionInput } from "@/lib/shelf-description";

export function ShelfDescriptionGenerator({ input, userId, disabled, automatic = false, onGenerated, onBusy }: {
  input: ShelfDescriptionInput; userId: string; disabled: boolean; automatic?: boolean;
  onGenerated: (description: ShelfDescription) => void; onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const started = useRef(false);
  const generate = useCallback(async () => {
    if (disabled || pending.current) return;
    const controller = new AbortController();
    pending.current = controller; setBusy(true); onBusy(true); setError(null);
    try {
      const response = await cueApiFetch("/api/shelf-description", userId, {
        method: "POST", body: JSON.stringify(input), signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "名前・状況を生成できませんでした。");
      if (!body.description?.title?.trim() || !body.description?.context?.trim()) throw new Error("名前・状況を生成できませんでした。");
      if (!controller.signal.aborted) onGenerated(body.description);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "名前・状況を生成できませんでした。");
    } finally {
      if (!controller.signal.aborted) { pending.current = null; setBusy(false); onBusy(false); }
    }
  }, [disabled, input, userId, onGenerated, onBusy]);
  useEffect(() => {
    if (!automatic || started.current || disabled) return;
    const frame = requestAnimationFrame(() => { started.current = true; void generate(); });
    return () => cancelAnimationFrame(frame);
  }, [automatic, disabled, generate]);
  useEffect(() => () => { pending.current?.abort(); onBusy(false); }, [onBusy]);
  return <div className="shelf-description-generator">
    <button type="button" className="text-action" disabled={disabled || busy || (!input.lists.length && !input.context.trim())} onClick={() => void generate()}>
      {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <WandSparkles size={16} aria-hidden="true" />}
      {busy ? "名前・状況を生成中" : "名前・状況を生成"}
    </button>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
  </div>;
}
