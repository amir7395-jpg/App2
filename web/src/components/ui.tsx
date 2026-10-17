"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

/** Fetch JSON from the API with loading/error state and a reload function. */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [path]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  return { data, error, reload: load };
}

const TONES: Record<string, string> = {
  new: "blue", contacted: "blue", follow_up: "amber", appointment_set: "green", not_interested: "", do_not_call: "red", unreachable: "",
  scheduled: "blue", completed: "green", cancelled: "", no_show: "red",
  open: "amber", promised: "blue", paid: "green", disputed: "red", written_off: "",
  queued: "", in_progress: "blue", no_answer: "amber", voicemail: "amber", failed: "red",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = TONES[status];
  return <span className={`badge${tone ? ` badge-${tone}` : ""}`}>{status.replace(/_/g, " ")}</span>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return error ? <p className="alert alert-error" role="alert">{error}</p> : null;
}

/** Runs an async action, exposing busy + error state for buttons and forms. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
