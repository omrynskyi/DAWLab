import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  HardDrive,
  FolderGit2,
  Folder,
  Plus,
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { validateUsername, sanitizeUsername } from "../../utils/usernameUtils";
import {
  DitherGradient,
  tweenDither,
  easeInOutCubic,
  ONBOARDING_DITHER,
  ONBOARDING_DITHER_OUTRO,
  type DitherGradientHandle,
} from "../ui/DitherGradient";
import wordmark from "../../assets/Dawlab-Text.png";
import "./Onboarding.css";

interface OnboardingProps {
  /** Called when the wizard finishes (or is skipped) and the app should mount. */
  onComplete: () => void;
}

interface ScannedProject {
  path: string;
  name: string;
  dawType: string;
  primaryFile?: string;
  candidates: string[];
  alreadyImported: boolean;
}

interface ScanProgress {
  scannedDirs: number;
  found: number;
  currentPath: string;
}

type Step = "user" | "storage" | "scanOffer" | "scan" | "importing";

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const reduce = useReducedMotion();

  const [step, setStep] = useState<Step>("user");
  const [direction, setDirection] = useState(1);
  const ditherRef = useRef<DitherGradientHandle>(null);

  // Step 1 — user
  const [username, setUsername] = useState("");
  const [userError, setUserError] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  // Step 2 — storage (Project recommended)
  const [storageMode, setStorageMode] = useState<"home" | "project">("project");

  // Step 4 — scan
  const [availableRoots, setAvailableRoots] = useState<string[]>([]);
  const [selectedRoots, setSelectedRoots] = useState<string[]>([]);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "results">("idle");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<ScannedProject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const goto = (next: Step, dir = 1) => {
    setDirection(dir);
    setStep(next);
  };

  // Prefill the username suggestion and default scan roots.
  useEffect(() => {
    window.ipcRenderer
      .invoke("get-suggested-username")
      .then((s: string) => setUsername((prev) => prev || s || ""));
    window.ipcRenderer.invoke("get-default-scan-roots").then((r: string[]) => {
      setAvailableRoots(r || []);
      setSelectedRoots(r || []);
    });
  }, []);

  // Live scan progress.
  useEffect(() => {
    const handler = (_e: unknown, p: ScanProgress) => setProgress(p);
    window.ipcRenderer.on("scan-progress", handler);
    return () => {
      window.ipcRenderer.removeAllListeners("scan-progress");
    };
  }, []);

  // Outro: drive the blue down + out by animating the shader params (never the
  // element transform), so the dither stays crisp as it fills the screen.
  useEffect(() => {
    if (step !== "importing") return;
    const handle = ditherRef.current;
    if (!handle) return;
    if (reduce) {
      handle.setParams(ONBOARDING_DITHER_OUTRO);
      return;
    }
    return tweenDither(handle, ONBOARDING_DITHER_OUTRO, {
      duration: 1.15,
      delay: 0.05,
      ease: easeInOutCubic,
    });
  }, [step, reduce]);

  const handleUserNext = async () => {
    const validation = validateUsername(username);
    if (!validation.isValid) {
      setUserError(validation.error ?? "Invalid username");
      return;
    }
    setSavingUser(true);
    setUserError(null);
    try {
      await window.ipcRenderer.invoke("set-username", username);
      goto("storage");
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Could not save username");
    } finally {
      setSavingUser(false);
    }
  };

  const handleStorageNext = async () => {
    try {
      await window.ipcRenderer.invoke("set-default-storage-mode", storageMode);
    } catch {
      // Non-fatal — a default already exists; onboarding can proceed.
    }
    goto("scanOffer");
  };

  const addFolder = async () => {
    const folder = await window.electronAPI.pickFolder();
    if (!folder) return;
    setAvailableRoots((prev) => (prev.includes(folder) ? prev : [...prev, folder]));
    setSelectedRoots((prev) => (prev.includes(folder) ? prev : [...prev, folder]));
  };

  const toggleRoot = (root: string) => {
    setSelectedRoots((prev) =>
      prev.includes(root) ? prev.filter((r) => r !== root) : [...prev, root],
    );
  };

  const startScan = async () => {
    setScanState("scanning");
    setProgress(null);
    try {
      const res: ScannedProject[] = await window.ipcRenderer.invoke(
        "scan-for-projects",
        selectedRoots,
      );
      setResults(res);
      setSelected(new Set(res.filter((r) => !r.alreadyImported).map((r) => r.path)));
    } catch {
      setResults([]);
    } finally {
      setScanState("results");
    }
  };

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectableProjects = results.filter((r) => !r.alreadyImported);
  const allSelected =
    selectableProjects.length > 0 && selected.size === selectableProjects.length;

  const toggleAll = () => {
    setSelected(
      allSelected ? new Set() : new Set(selectableProjects.map((r) => r.path)),
    );
  };

  // Plays the outro (blue fills, "Welcome to DAWLab" fades in) while any work
  // runs, then reveals the app. Held to at least the outro animation length.
  const OUTRO_MS = 2600;
  const finishToLogo = async (work?: () => Promise<void>) => {
    goto("importing");
    const start = Date.now();
    if (work) {
      try {
        await work();
      } catch {
        // Failures are surfaced/handled by the caller's work; finish regardless.
      }
    }
    window.setTimeout(onComplete, Math.max(0, OUTRO_MS - (Date.now() - start)));
  };

  const runImport = () => {
    const chosen = results.filter((r) => selected.has(r.path));
    if (chosen.length === 0) {
      finishToLogo();
      return;
    }

    // De-dupe display names within the batch so bulk init doesn't collide.
    const used = new Set<string>();
    const entries = chosen.map((r) => {
      const base = r.name || "project";
      let name = base;
      let n = 2;
      while (used.has(name.toLowerCase())) name = `${base} ${n++}`;
      used.add(name.toLowerCase());
      return { projectName: name, projectPath: r.path, primaryFile: r.primaryFile };
    });

    finishToLogo(async () => {
      await window.ipcRenderer.invoke("init-projects-bulk", entries, {
        author: username,
        storageMode,
      });
    });
  };

  const variants = {
    enter: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * 40 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * -40 }),
  };

  return (
    <div className={`onboarding${step === "importing" ? " is-outro" : ""}`}>
      {/* One WebGL dither backdrop for the whole flow. Its params animate on the
          outro (see the tween effect) — the element itself never transforms, so
          the dither dots stay crisp as the blue fills the screen. */}
      <div className="onboarding__backdrop" aria-hidden="true">
        <DitherGradient ref={ditherRef} {...ONBOARDING_DITHER} />
      </div>

      {step === "importing" ? (
        <div className="ob-outro">
          <div className="ob-outro__content">
            <span className="ob-outro__welcome">Welcome to</span>
            <img className="ob-outro__wordmark" src={wordmark} alt="DAWLab" />
          </div>
        </div>
      ) : (
      <div className="onboarding__inner">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            className="onboarding__step"
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {step === "user" && (
              <div className="ob-step">
                <h1 className="ob-title ob-title--welcome">
                  Welcome to
                  <img className="ob-wordmark" src={wordmark} alt="DAWLab" />
                </h1>
                <p className="ob-subtitle">
                  Pick a username. It labels your work and keeps your projects
                  separate on this machine.
                </p>
                <div className="ob-field">
                  <input
                    className={`ob-input ${userError ? "is-error" : ""}`}
                    value={username}
                    onChange={(e) => {
                      setUsername(sanitizeUsername(e.target.value));
                      setUserError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleUserNext()}
                    placeholder="username"
                    autoFocus
                    spellCheck={false}
                  />
                  {userError ? (
                    <span className="ob-hint is-error">{userError}</span>
                  ) : (
                    <span className="ob-hint">
                      3–30 characters · lowercase letters, numbers, underscores
                    </span>
                  )}
                </div>
                <div className="ob-actions">
                  <button
                    className="ob-btn ob-btn--primary"
                    onClick={handleUserNext}
                    disabled={savingUser}
                  >
                    {savingUser ? (
                      <Loader2 size={16} className="ob-spin" />
                    ) : (
                      <>
                        Continue <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {step === "storage" && (
              <div className="ob-step">
                <h1 className="ob-title">Where should history live?</h1>
                <p className="ob-subtitle">
                  DAWLab keeps a version history for every project. Choose where
                  that history is stored. You can override this per project later.
                </p>
                <div
                  className="ob-options"
                  role="radiogroup"
                  aria-label="Where history is stored"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={storageMode === "project"}
                    className={`ob-option ${storageMode === "project" ? "is-active" : ""}`}
                    onClick={() => setStorageMode("project")}
                  >
                    <span className="ob-rec">Recommended</span>
                    <span className="ob-option__icon">
                      <FolderGit2 size={26} />
                    </span>
                    <span className="ob-option__text">
                      <span className="ob-option__title">Project Folder</span>
                      <span className="ob-option__desc">
                        Kept next to your DAW files. Move the folder, keep its history.
                      </span>
                    </span>
                    <span className="ob-radio" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={storageMode === "home"}
                    className={`ob-option ${storageMode === "home" ? "is-active" : ""}`}
                    onClick={() => setStorageMode("home")}
                  >
                    <span className="ob-option__icon">
                      <HardDrive size={26} />
                    </span>
                    <span className="ob-option__text">
                      <span className="ob-option__title">Home Library</span>
                      <span className="ob-option__desc">
                        Kept in one place in your home folder, apart from your DAW files.
                      </span>
                    </span>
                    <span className="ob-radio" aria-hidden="true" />
                  </button>
                </div>
                <div className="ob-actions">
                  <button
                    className="ob-btn ob-btn--ghost"
                    onClick={() => goto("user", -1)}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button className="ob-btn ob-btn--primary" onClick={handleStorageNext}>
                    Continue <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {step === "scanOffer" && (
              <div className="ob-step">
                <h1 className="ob-title">Find your existing projects</h1>
                <p className="ob-subtitle">
                  We can scan your drive for Logic, Ableton, FL Studio, Reaper,
                  and Pro Tools projects, then let you pick which ones to bring
                  into DAWLab.
                </p>
                <div className="ob-actions">
                  <button
                    className="ob-btn ob-btn--ghost"
                    onClick={() => goto("storage", -1)}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                  <div className="ob-actions__group">
                    <button
                      className="ob-btn ob-btn--ghost"
                      onClick={() => finishToLogo()}
                    >
                      Skip for now
                    </button>
                    <button
                      className="ob-btn ob-btn--primary"
                      onClick={() => goto("scan")}
                    >
                      Scan for projects <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === "scan" && scanState === "idle" && (
              <div className="ob-step">
                <h1 className="ob-title">Where should we look?</h1>
                <p className="ob-subtitle">
                  These folders are selected by default. Add another if your
                  projects live elsewhere.
                </p>
                <div className="ob-roots">
                  {availableRoots.map((root) => {
                    const on = selectedRoots.includes(root);
                    return (
                      <button
                        key={root}
                        className={`ob-root ${on ? "is-on" : ""}`}
                        onClick={() => toggleRoot(root)}
                        title={root}
                      >
                        <Folder size={16} />
                        <span className="ob-root__label">{shortenPath(root)}</span>
                        {on && <Check size={14} className="ob-root__check" />}
                      </button>
                    );
                  })}
                  <button className="ob-root ob-root--add" onClick={addFolder}>
                    <Plus size={16} /> Add folder
                  </button>
                </div>
                <div className="ob-actions">
                  <button
                    className="ob-btn ob-btn--ghost"
                    onClick={() => goto("scanOffer", -1)}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    className="ob-btn ob-btn--primary"
                    onClick={startScan}
                    disabled={selectedRoots.length === 0}
                  >
                    Start scan <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {step === "scan" && scanState === "scanning" && (
              <div className="ob-step ob-step--center">
                <Loader2 size={34} className="ob-spin ob-scan-spinner" />
                <h1 className="ob-title">Scanning your drive…</h1>
                <p className="ob-subtitle">
                  {progress ? `Found ${progress.found} so far` : "Getting started…"}
                </p>
                {progress?.currentPath && (
                  <p className="ob-scan-path">{shortenPath(progress.currentPath)}</p>
                )}
              </div>
            )}

            {step === "scan" && scanState === "results" && (
              <div className="ob-step">
                <h1 className="ob-title">
                  {results.length > 0
                    ? `Found ${results.length} project${results.length === 1 ? "" : "s"}`
                    : "No projects found"}
                </h1>
                {results.length > 0 ? (
                  <>
                    <div className="ob-results-head">
                      <button className="ob-selectall" onClick={toggleAll}>
                        {allSelected ? "Deselect all" : "Select all"}
                      </button>
                      <span className="ob-selectcount">{selected.size} selected</span>
                    </div>
                    <ul className="ob-results">
                      {results.map((r) => (
                        <li
                          key={r.path}
                          className={`ob-result ${r.alreadyImported ? "is-disabled" : ""} ${
                            selected.has(r.path) ? "is-selected" : ""
                          }`}
                          onClick={() => !r.alreadyImported && toggleSelect(r.path)}
                        >
                          <span className="ob-checkbox">
                            {selected.has(r.path) && <Check size={13} />}
                          </span>
                          <span className="ob-result__body">
                            <span className="ob-result__name">{r.name}</span>
                            <span className="ob-result__path">{shortenPath(r.path)}</span>
                          </span>
                          <span className="ob-daw">{r.dawType}</span>
                          {r.alreadyImported && (
                            <span className="ob-imported">Imported</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="ob-subtitle">
                    We couldn't find any DAW projects in the folders you picked.
                    You can start a project from the library any time.
                  </p>
                )}
                <div className="ob-actions">
                  <button
                    className="ob-btn ob-btn--ghost"
                    onClick={() => setScanState("idle")}
                  >
                    <ArrowLeft size={16} /> Change folders
                  </button>
                  {results.length > 0 && selected.size > 0 ? (
                    <button className="ob-btn ob-btn--primary" onClick={runImport}>
                      Import {selected.size} <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button className="ob-btn ob-btn--primary" onClick={onComplete}>
                      Finish
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      )}
    </div>
  );
};

/** Shows the last two path segments with a leading ellipsis for long paths. */
function shortenPath(p: string): string {
  if (!p) return "";
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return p;
  return `…/${parts.slice(-2).join("/")}`;
}
