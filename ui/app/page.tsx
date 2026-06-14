"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SAMPLES } from "@/lib/samples";

type Verdict = "PASS" | "FAIL" | "ERROR";
interface LaneResult { lane: string; verdict: Verdict; detail: string }
interface VerifyResult { verdict: "PASS" | "FAIL"; reason: string; lanes: LaneResult[]; elapsedMs: number }
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

  const byLane = (id: string) => result?.lanes.find((l) => l.lane === id);

  async function run() {
    if (!diff.trim() || status === "running") return;
    setStatus("running");
    setError("");
    setResult(null);
    setRunId(Math.random().toString(16).slice(2, 6).toUpperCase());
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, diff }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed.");
      setResult(data);
      setStatus("done");
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
            note={
              status === "done" && result
                ? `REPORT ${runId} · ${(result.elapsedMs / 1000).toFixed(1)}s`
                : "4 parallel lanes"
            }
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

          <p className="mt-5 font-sans text-[12.5px] leading-relaxed text-dim">
            <span className="text-muted">RUN-CHECK</span> and <span className="text-muted">JUDGE</span>{" "}
            execute on the RocketRide C++ runtime; <span className="text-muted">SECRETS</span> and{" "}
            <span className="text-muted">SIZE</span> are deterministic. Overall is PASS only if every lane passes.
          </p>
        </section>
      </main>
    </div>
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
