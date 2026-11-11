"use client";

/**
 * RENDER_PROVIDER=eth: the exact prompts the render sends (likeness-eth's templates, lib/ai/eth-prompts.ts), updated
 * as the brand edits the Studio form's kind and prompt, so they see what they pay for before they press Render.
 */
import { useEffect, useState } from "react";
import { fullPrompt, promptsFor, type EthKind } from "@/lib/ai/eth-prompts";

export function PromptPreview({ formId, seconds }: { formId: string; seconds: number }) {
  const [state, setState] = useState<{ kind: EthKind; brief: string }>({ kind: "image", brief: "" });
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const read = () => {
      const data = new FormData(form);
      setState({ kind: data.get("kind") === "video" ? "video" : "image", brief: String(data.get("prompt") ?? "") });
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
    };
  }, [formId]);
  const text = state.brief.trim() ? fullPrompt(state.kind, promptsFor(state.kind, state.brief)) : "";
  return (
    <details className="rounded-[14px] bg-paper px-4 py-3 text-[13px]">
      <summary className="min-h-11 cursor-pointer content-center font-semibold text-ink">
        Exact prompt sent ({state.kind === "video" ? `an opening still, then ${seconds} s of motion at 16:9` : "one image"})
      </summary>
      <pre className="m-0 mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-grey">{text || "Write a prompt to see it."}</pre>
    </details>
  );
}
