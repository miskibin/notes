import { CircleAlert, LoaderCircle, Sparkles, WandSparkles } from "lucide-react";
import type { CompletionStatus } from "./editor/autocomplete";

export function AppFooter({ saveState, words, enabled, model, status, error, sourceMode, editing, formatting, onToggle, onFormat, onRetrySave }: {
  saveState: "saved" | "saving" | "error";
  words: number;
  enabled: boolean;
  model: string;
  status: CompletionStatus;
  error: string | null;
  sourceMode: boolean;
  editing: boolean;
  formatting: boolean;
  onToggle: () => void;
  onFormat: () => void;
  onRetrySave: () => void;
}) {
  const state = !enabled ? "Off" : sourceMode || !editing ? "Paused" : status === "suggestion" ? "Tab to accept" :
    !model.trim() ? "Choose model" : status === "loading" ? "Thinking…" : status === "error" ? "Unavailable" : "On";
  const hint = !enabled ? "Turn on inline suggestions" : !model.trim() ? "Choose an autocomplete model in Settings" :
    sourceMode ? "Autocomplete works in live preview. Switch from Markdown source to resume." :
    status === "error" ? `${error || "Ollama request failed."} Check the address and model in Settings.` :
    `Model: ${model}. Tab accepts a suggestion; Esc dismisses it. Click to turn off.`;
  return (
    <footer className="app-footer" aria-label="Editor status and tools">
      <div className="footer-document" role="status" aria-live="polite">
        {saveState === "error" ? (
          <button className="footer-button footer-error" onClick={onRetrySave} title="Save failed. Click to retry.">
            <CircleAlert aria-hidden="true" /> Save failed · Retry
          </button>
        ) : (
          <span className="footer-save">{saveState === "saving" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}
            {saveState === "saving" ? "Saving…" : "Saved"}</span>
        )}
        <span className="footer-word-count">{new Intl.NumberFormat().format(words)} {words === 1 ? "word" : "words"}</span>
      </div>
      <div className="footer-tools">
        <button type="button" className={`footer-button footer-autocomplete${enabled && status === "error" ? " footer-error" : ""}`}
          aria-label="Toggle autocomplete" aria-pressed={enabled} onClick={onToggle} title={hint}>
          {enabled && status === "loading" && !sourceMode ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          <span>Autocomplete <span className="footer-state" role="status" aria-live="polite">· {state}</span></span>
        </button>
        <button type="button" className="footer-button footer-format" onClick={onFormat} disabled={!editing || formatting}
          aria-label="Format Markdown"
          title="Let AI organize this note into headings, lists and math. Preview before applying.">
          <WandSparkles aria-hidden="true" /> <span>Format</span>
        </button>
      </div>
    </footer>
  );
}
