'use client';

import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Markdown for IA answers (GFM: tables, lists, code, links). react-markdown
// never renders raw HTML, so model output can't inject markup.
const components: Components = {
  h1: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-semibold text-white first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold text-white first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-4 text-[15px] font-semibold text-white first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold text-zinc-100 first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-sky-400">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:text-sky-400">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-sky-500/60 pl-4 text-zinc-400">{children}</blockquote>,
  hr: () => <hr className="my-5 border-zinc-800" />,
  a: ({ href, children }) => {
    const safe = href && /^(https?:|mailto:)/i.test(href) ? href : undefined;
    return safe ? (
      <a href={safe} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline decoration-sky-400/40 underline-offset-2 hover:decoration-sky-400">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  code: ({ className, children }) =>
    className ? (
      <code className={`${className} block`}>{children}</code>
    ) : (
      <code className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.88em] text-sky-200">{children}</code>
    ),
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-xl border border-zinc-800 bg-black/60 p-4 font-mono text-[13px] leading-relaxed text-zinc-200">{children}</pre>,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.04] text-zinc-200">{children}</thead>,
  th: ({ children }) => <th className="border-b border-zinc-800 px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-zinc-800/70 px-3 py-2 align-top">{children}</td>,
};

export const ChatMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <div className="break-words">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  </div>
);
