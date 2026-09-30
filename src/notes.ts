export const WELCOME_NOTE = [
  "# Welcome",
  "",
  "This note is the page. Headings, lists, and tables render as you write.",
  "",
  "Inline math $E = mc^2$ sits in the sentence.",
  "",
  "$$",
  "\\int_0^1 x^2 \\, dx",
  "$$",
  "",
  "```",
  "const answer = 42",
  "```",
  "",
  "Paste markdown, or drop an image.",
  "",
].join("\n");

export type NoteFile = {
  name: string;
  title: string;
  modified_ms: number;
};

export function titleFrom(markdown: string, filename: string): string {
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^#{1,6}\s+(\S.*)$/.exec(line.trim());
    if (match?.[1]) return match[1].trim();
  }
  return filename.replace(/\.md$/i, "");
}

export function retitle(markdown: string, title: string): string {
  const next = title.trim();
  if (!next) return markdown;
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+\S.*$/.exec(lines[index]?.trim() ?? "");
    if (!match?.[1]) continue;
    const indent = /^\s*/.exec(lines[index] ?? "")?.[0] ?? "";
    lines[index] = `${indent}${match[1]} ${next}`;
    return lines.join("\n");
  }
  const body = markdown.replace(/^\s*/, "");
  return body ? `# ${next}\n\n${body}` : `# ${next}\n`;
}

export function newNoteName(existing: string[]): string {
  if (!existing.includes("untitled.md")) return "untitled.md";
  let index = 2;
  while (existing.includes(`untitled-${index}.md`)) index += 1;
  return `untitled-${index}.md`;
}
