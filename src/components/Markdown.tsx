/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Input } from "./ui";
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Full GitHub-Flavored Markdown renderer styled for the app's dark theme.
// Safe by default: react-markdown does NOT render raw HTML (no rehype-raw),
// so note content can't inject markup. Lazy-loaded by the Notes reader/editor.

const components: Components = {
  h1: ({ node, ...p }) => <h1 className="text-lg font-extrabold text-slate-100 mt-3 mb-1.5" {...p} />,
  h2: ({ node, ...p }) => <h2 className="text-base font-bold text-sky-400 mt-3 mb-1.5 border-b border-slate-800 pb-1" {...p} />,
  h3: ({ node, ...p }) => <h3 className="text-sm font-bold text-slate-100 mt-2.5 mb-1" {...p} />,
  h4: ({ node, ...p }) => <h4 className="text-xs font-bold text-slate-200 mt-2 mb-1 uppercase tracking-wide" {...p} />,
  p:  ({ node, ...p }) => <p className="my-1.5 text-slate-300" {...p} />,
  a:  ({ node, ...p }) => <a className="text-sky-400 underline underline-offset-2 hover:text-sky-300 break-all" target="_blank" rel="noreferrer noopener" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-bold text-slate-100" {...p} />,
  em: ({ node, ...p }) => <em className="italic" {...p} />,
  del: ({ node, ...p }) => <del className="text-slate-500" {...p} />,
  ul: ({ node, ...p }) => <ul className="list-disc pl-5 my-1.5 space-y-1 marker:text-slate-600" {...p} />,
  ol: ({ node, ...p }) => <ol className="list-decimal pl-5 my-1.5 space-y-1 marker:text-slate-500" {...p} />,
  li: ({ node, ...p }) => <li className="text-slate-300" {...p} />,
  input: ({ node, ...p }) => <Input {...p} disabled className="mr-1.5 align-middle accent-emerald-500 w-3.5 h-3.5 rounded pointer-events-none" />,
  blockquote: ({ node, ...p }) => <blockquote className="border-l-2 border-sky-500/50 pl-3 my-2 text-slate-400 italic" {...p} />,
  hr: () => <hr className="my-3 border-slate-800" />,
  pre: ({ node, ...p }) => <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 my-2 overflow-x-auto" {...p} />,
  code: ({ node, className, children, ...p }) => {
    const text = String(children ?? "");
    const isBlock = /\n/.test(text.trimEnd()) || /^language-/.test(className || "");
    if (isBlock) {
      return <code className={`block font-mono text-[11px] text-emerald-300 whitespace-pre ${className || ""}`} {...p}>{children}</code>;
    }
    return <code className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[11px] text-amber-300" {...p}>{children}</code>;
  },
  table: ({ node, ...p }) => <div className="overflow-x-auto my-2"><table className="w-full text-[11px] border border-slate-800 rounded-lg overflow-hidden" {...p} /></div>,
  thead: ({ node, ...p }) => <thead className="bg-slate-950" {...p} />,
  th: ({ node, ...p }) => <th className="border border-slate-800 px-2 py-1 text-left font-bold text-slate-200" {...p} />,
  td: ({ node, ...p }) => <td className="border border-slate-800 px-2 py-1 text-slate-300" {...p} />,
  img: ({ node, ...p }) => <img className="max-w-full rounded-lg my-2 border border-slate-800" loading="lazy" referrerPolicy="no-referrer" {...p} />,
};

export default function Markdown({ content }: { content: string }) {
  if (!content || !content.trim()) {
    return <p className="text-slate-500 italic text-xs">Ghi chú trống…</p>;
  }
  return (
    <div className="text-xs text-slate-300 leading-relaxed break-words [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-1 [&_.task-list-item]:list-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>

  );
}
