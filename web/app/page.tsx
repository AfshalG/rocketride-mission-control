"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SAMPLES } from "@/lib/samples";
import { formatVerdictMarkdown } from "@/lib/markdown";
import { loadHistory, pushHistory, clearHistory, type HistoryEntry } from "@/lib/history";
import type { VerifyResult, LaneResult, Verdict } from "@/lib/types";
import { LANE_ORDER, JUDGE_MODELS, DEFAULT_JUDGE_MODEL, DEFAULT_OPENROUTER_MODEL } from "@/lib/types";

type Status = "idle" | "running" | "done" | "error";

const LANES = [
  { id: "run", no: "01", name: "RUN-CHECK", desc: "executes the code in a sandbox" },
  { id: "secrets", no: "02", name: "SECRETS", desc: "scans the diff for leaked keys" },
  { id: "size", no: "03", name: "SIZE · COST", desc: "flags runaway / bloated diffs" },
  { id: "judge", no: "04", name: "JUDGE", desc: "is it correct vs the task?" },
] as const;

const COLOR: Record<Verdict, string> = { PASS: "text-pass", FAIL: "text-fail", ERROR: "text-amber" };
const DOT: Record<Verdict, string> = { PASS: "bg-pass", FAIL: "bg-fail", ERROR: "bg-amber" };

export default function Home() {
  const [task, setTask] = useState("");
  const [diff, setDiff] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [runId, setRunId] = useState("");
  const [model, setModel] = useState(DEFAULT_JUDGE_MODEL);
  const [orModel, setOrModel] = useState(DEFAULT_OPENROUTER_MODEL);
  const [prRef, setPrRef] = useState("");
  const [prLoading, setPrLoading] = useState(false);
  const [prMsg, setPrMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const byLane = (id: string) => result?.summary.find((l) => l.lane === id);
  const modelLabel =
    model === "openrouter" ? `OpenRouter · ${orModel}` : JUDGE_MODELS.find((m) => m.id === model)?.label ?? model;

  function restore(h: HistoryEntry) {
    setTask(h.task);
    setDiff(h.diff);
    setModel(h.model);
    setOrModel(h.orModel || DEFAULT_OPENROUTER_MODEL);
    setRunId(h.id);
    setResult(h.result);
    setStatus("done");
    setError("");
    setPrMsg(null);
  }

  async function copyComment() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(formatVerdictMarkdown(result, modelLabel));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  async function loadPr() {
    if (!prRef.trim() || prLoading) return;
    setPrLoading(true);
    setPrMsg(null);
    try {
      const res = await fetch("/api/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: prRef }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch PR.");
      setTask(data.task);
      setDiff(data.diff);
      setStatus("idle");
      setResult(null);
      setError("");
      setPrMsg({
        kind: "ok",
        text: `Loaded ${data.ref}: "${data.title}"${data.truncated ? " (diff truncated)" : ""} — review and run verification.`,
      });
    } catch (e) {
      setPrMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to fetch PR." });
    } finally {
      setPrLoading(false);
    }
  }

  async function run() {
    if (!diff.trim() || status === "running") return;
    setStatus("running");
    setError("");
    setResult(null);
    const id = Math.random().toString(16).slice(2, 6).toUpperCase();
    setRunId(id);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, diff, model, orModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed.");
      setResult(data);
      setStatus("done");
      setHistory(pushHistory({ id, ts: Date.now(), task, diff, model, orModel, result: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
      setStatus("error");
    }
  }

  function loadSample(s: (typeof SAMPLES)[number]) {
    setTask(s.task);
    setDiff(s.diff);
    setStatus("idle");
    setResult(null);
    setError("");
  }

  return (
    <div className="min-h-full">
      {/* masthead */}
      <header className="border-b border-line sticky top-0 z-10 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-block h-3.5 w-3.5 rotate-45 border border-accent bg-accent/25" />
            <div className="leading-tight">
              <div className="font-mono text-[15px] font-semibold tracking-[0.2em] text-fg">
                MISSION&nbsp;CONTROL
              </div>
              <div className="font-mono text-[11px] tracking-[0.16em] text-dim">
                VERIFY WHAT AI AGENTS SHIP
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-muted">
            <span className="h-2 w-2 rounded-full bg-pass shadow-[0_0_8px] shadow-pass" />
            ENGINE ONLINE
            <span className="text-dim hidden sm:inline">· ROCKETRIDE</span>
          </div>
        </div>
      </header>

      {/* intro strip */}
      <div className="border-b border-line/70">
        <div className="mx-auto max-w-6xl px-6 py-2.5 font-sans text-[13px] text-muted">
          Paste the <span className="text-fg">task</span> an agent was given and the{" "}
          <span className="text-fg">git diff</span> it produced → a PASS / FAIL verdict from
          four parallel checks.{" "}
          <span className="text-dim">New? Load a sample.</span>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8 lg:py-10 grid gap-7 lg:gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ── console ── */}
        <section className="flex flex-col gap-5">
          <SectionLabel index="01" title="INPUT" note="task + git diff" />

          {/* fetch a real PR */}
          <div className="rounded-md border border-line bg-surface/40 p-3 flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <label className="font-mono text-[11px] tracking-[0.18em] text-muted">FROM A GITHUB PR</label>
              <span className="font-sans text-[12px] text-dim">— we fetch its title + diff</span>
            </div>
            <div className="flex gap-2">
              <input
                value={prRef}
                onChange={(e) => setPrRef(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") loadPr(); }}
                placeholder="github.com/owner/repo/pull/123   ·   owner/repo#123"
                className="flex-1 min-w-0 bg-surface border border-line rounded-md px-3 py-2 font-mono text-[12.5px] text-fg placeholder:text-dim outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={loadPr}
                disabled={!prRef.trim() || prLoading}
                className="shrink-0 font-mono text-[12px] tracking-[0.12em] text-fg border border-line-strong bg-surface-2 rounded-md px-4 hover:border-accent disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
              >
                {prLoading ? "LOADING…" : "LOAD PR"}
              </button>
            </div>
            {prMsg && (
              <div className={`font-sans text-[12px] leading-snug ${prMsg.kind === "ok" ? "text-pass" : "text-fail"}`}>
                {prMsg.text}
              </div>
            )}
            <div className="font-mono text-[10.5px] tracking-[0.06em] text-dim">— or fill it in manually below</div>
          </div>

          <Field label="TASK" hint="what you told the AI agent to do">
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="e.g. Add a function add(a, b) that returns a + b"
              className="w-full bg-surface border border-line rounded-md px-3.5 py-2.5 text-[14px] text-fg placeholder:text-dim outline-none focus:border-accent transition-colors"
            />
          </Field>

          <Field label="DIFF" hint="the code the agent changed — the output of `git diff`">
            <textarea
              value={diff}
              onChange={(e) => setDiff(e.target.value)}
              spellCheck={false}
              placeholder="Paste a unified git diff…"
              className="w-full bg-surface border border-line rounded-md px-3.5 py-3 font-mono text-[13px] leading-relaxed text-fg placeholder:text-dim outline-none focus:border-accent transition-colors h-56 resize-y"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] tracking-[0.16em] text-dim mr-1">SAMPLES</span>
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSample(s)}
                title={s.hint}
                className="font-mono text-[12px] tracking-wide text-muted border border-line rounded-md px-3 py-1.5 hover:border-accent hover:text-fg hover:bg-surface transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] tracking-[0.16em] text-dim mr-1">JUDGE&nbsp;MODEL</span>
            {JUDGE_MODELS.map((mo) => (
              <button
                key={mo.id}
                onClick={() => setModel(mo.id)}
                title={mo.note}
                className={`font-mono text-[12px] tracking-wide rounded-md px-3 py-1.5 border transition-colors ${
                  model === mo.id
                    ? "border-accent text-fg bg-surface"
                    : "border-line text-muted hover:border-accent/60 hover:text-fg"
                }`}
              >
                {mo.label}
                {mo.note && <span className="text-dim"> · {mo.note}</span>}
              </button>
            ))}
          </div>

          {model === "openrouter" && (
            <div className="flex flex-col gap-1 -mt-2">
              <input
                value={orModel}
                onChange={(e) => setOrModel(e.target.value)}
                spellCheck={false}
                placeholder="anthropic/claude-sonnet-4.6 · openai/gpt-5 · deepseek/deepseek-chat"
                className="w-full bg-surface border border-line rounded-md px-3 py-2 font-mono text-[12px] text-fg placeholder:text-dim outline-none focus:border-accent transition-colors"
              />
              <span className="font-mono text-[10px] tracking-[0.06em] text-dim">
                any OpenRouter model slug — needs ROCKETRIDE_OPENROUTER_KEY set in the engine
              </span>
            </div>
          )}

          <button
            onClick={run}
            disabled={!diff.trim() || status === "running"}
            className="group relative overflow-hidden mt-1 flex items-center justify-center gap-2 rounded-md border border-line-strong bg-surface-2 px-5 py-3.5 font-mono text-[13px] tracking-[0.16em] text-fg disabled:opacity-45 disabled:cursor-not-allowed hover:border-accent hover:bg-surface transition-colors"
          >
            {status === "running" && (
              <span className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-accent/30 to-transparent sweep" />
            )}
            <span className="relative">{status === "running" ? "VERIFYING…" : "RUN VERIFICATION →"}</span>
          </button>
        </section>

        {/* ── verdict panel ── */}
        <section className="flex flex-col">
          <SectionLabel
            index="02"
            title="VERDICT"
            note={status === "done" && result ? `REPORT ${runId}` : "4 parallel lanes"}
          />

          <div className="mt-4 rounded-lg border border-line bg-surface/50 overflow-hidden">
            {/* overall banner */}
            <div className="px-6 py-5 border-b border-line">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="font-mono text-[11px] tracking-[0.2em] text-dim mb-1.5">OVERALL</div>
                  <div className={`font-mono text-4xl font-bold tracking-tight tnum ${result ? COLOR[result.verdict] : "text-dim"}`}>
                    {status === "running" ? "····" : result ? result.verdict : "—"}
                  </div>
                </div>
                <div className="text-right font-sans text-[13px] leading-relaxed max-w-[52%]">
                  {status === "error" ? (
                    <span className="text-fail">{error}</span>
                  ) : status === "running" ? (
                    <span className="text-muted">running 4 lanes in parallel on the RocketRide engine…</span>
                  ) : result ? (
                    <span className="text-muted">{result.reason}</span>
                  ) : (
                    <span className="text-dim">paste a diff and run verification</span>
                  )}
                </div>
              </div>
              {status === "done" && result && (
                <div className="mt-3 font-mono text-[10.5px] tracking-[0.1em] text-dim">
                  JUDGE&nbsp;MODEL · <span className="text-muted">{modelLabel}</span> ·{" "}
                  {(result.elapsedMs / 1000).toFixed(1)}s · {result.totalFiles} file
                  {result.totalFiles > 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* lanes */}
            <div className="divide-y divide-line">
              {LANES.map((lane, i) => {
                const r = byLane(lane.id);
                return (
                  <div key={lane.id} className="px-5 py-3 flex gap-4">
                    {/* number + indicator */}
                    <div className="flex flex-col items-center gap-2 pt-0.5 w-7 shrink-0">
                      <span className="font-mono text-[11px] text-dim">{lane.no}</span>
                      <span className="flex h-2.5 w-2.5">
                        {status === "running" ? (
                          <span className="h-2.5 w-2.5 rounded-full bg-amber blink" />
                        ) : r ? (
                          <span className={`h-2.5 w-2.5 rounded-full ${DOT[r.verdict]} shadow-[0_0_8px] shadow-current`} />
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full border border-dim" />
                        )}
                      </span>
                    </div>

                    {/* body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-mono text-[13px] tracking-[0.12em] text-fg">{lane.name}</div>
                        {r ? (
                          <span className={`font-mono text-[12px] tracking-[0.16em] ${COLOR[r.verdict]}`}>{r.verdict}</span>
                        ) : (
                          <span className="font-mono text-[12px] tracking-[0.16em] text-dim">
                            {status === "running" ? "··" : "—"}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] tracking-[0.03em] text-dim mt-0.5">{lane.desc}</div>
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={status + (r?.detail ?? "")}
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: status === "done" ? i * 0.1 : 0 }}
                          className="font-sans text-[12.5px] leading-relaxed text-muted mt-1.5"
                        >
                          {status === "running" ? "scanning…" : r ? r.detail : "standby — awaiting input"}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {status === "done" && result && result.totalFiles > 1 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-mono text-[12px] tracking-[0.22em] text-fg">FILES</span>
                <span className="font-mono text-[10.5px] tracking-[0.08em] text-dim">
                  {result.deepCheckedCount} of {result.totalFiles} deep-checked
                </span>
              </div>
              <div className="rounded-lg border border-line bg-surface/40 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2 border-b border-line font-mono text-[10px] tracking-[0.12em] text-dim">
                  <span className="flex-1">FILE</span>
                  {["RUN", "SEC", "SIZE", "JDG"].map((h) => (
                    <span key={h} className="w-9 text-center">{h}</span>
                  ))}
                </div>
                <div className="divide-y divide-line/70 max-h-72 overflow-auto">
                  {result.files.map((f) => (
                    <div key={f.file} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className="flex-1 min-w-0 truncate font-mono text-[12px] text-fg"
                        title={f.file}
                        style={{ direction: "rtl", textAlign: "left" }}
                      >
                        {f.file}
                      </span>
                      {LANE_ORDER.map((lane) => (
                        <Cell key={lane} r={f.lanes[lane]} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-2 font-sans text-[11.5px] text-dim">
                Every file is scanned for secrets &amp; size; the LLM lanes (run · judge) deep-check the
                top {result.deepCheckedCount} code file{result.deepCheckedCount > 1 ? "s" : ""} — lockfiles &amp; binaries skipped.
              </p>
            </div>
          )}

          {status === "done" && result && (
            <button
              onClick={copyComment}
              className="mt-5 self-start font-mono text-[11px] tracking-[0.12em] text-muted border border-line rounded-md px-3.5 py-2 hover:border-accent hover:text-fg transition-colors"
            >
              {copied ? "✓ COPIED" : "COPY AS PR COMMENT"}
            </button>
          )}

          <p className="mt-5 font-sans text-[12.5px] leading-relaxed text-dim">
            <span className="text-muted">RUN-CHECK</span> and <span className="text-muted">JUDGE</span>{" "}
            execute on the RocketRide C++ runtime; <span className="text-muted">SECRETS</span> and{" "}
            <span className="text-muted">SIZE</span> are deterministic. Overall is PASS only if every lane passes.
          </p>

          {history.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between border-b border-line/70 pb-2 mb-2.5">
                <span className="font-mono text-[12px] tracking-[0.22em] text-fg">RECENT</span>
                <button
                  onClick={() => setHistory(clearHistory())}
                  className="font-mono text-[10px] tracking-[0.12em] text-dim hover:text-fail transition-colors"
                >
                  CLEAR
                </button>
              </div>
              <div className="rounded-lg border border-line bg-surface/30 divide-y divide-line/60 overflow-hidden">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => restore(h)}
                    title="view this run"
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface transition-colors"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${h.result.verdict === "PASS" ? "bg-pass" : "bg-fail"}`} />
                    <span className="flex-1 min-w-0 truncate font-sans text-[12.5px] text-muted">{h.task || "(no task)"}</span>
                    <span className="font-mono text-[10.5px] text-dim shrink-0">{h.result.totalFiles}f</span>
                    <span
                      className={`font-mono text-[11px] tracking-wide shrink-0 ${h.result.verdict === "PASS" ? "text-pass" : "text-fail"}`}
                    >
                      {h.result.verdict}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Cell({ r }: { r: LaneResult | null }) {
  if (!r) return <span className="w-9 flex justify-center text-dim text-[12px]">–</span>;
  const color = r.verdict === "PASS" ? "bg-pass" : r.verdict === "FAIL" ? "bg-fail" : "bg-amber";
  return (
    <span className="w-9 flex justify-center" title={`${r.verdict}: ${r.detail}`}>
      <span className={`h-2 w-2 rounded-full ${color} shadow-[0_0_6px] shadow-current`} />
    </span>
  );
}

function SectionLabel({ index, title, note }: { index: string; title: string; note: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line pb-3">
      <span className="font-mono text-[12px] text-accent">{index}</span>
      <span className="font-mono text-[13px] tracking-[0.22em] text-fg">{title}</span>
      <span className="flex-1 h-px bg-line" />
      <span className="font-mono text-[11px] tracking-[0.1em] text-dim tnum">{note}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <label className="font-mono text-[11px] tracking-[0.18em] text-muted">{label}</label>
        <span className="font-sans text-[12px] text-dim">— {hint}</span>
      </div>
      {children}
    </div>
  );
}
