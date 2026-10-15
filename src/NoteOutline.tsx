export type OutlineHeading = { level: number; text: string; line: string };

// Top-level ATX headings outside fenced code and display math.
export function outlineHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,}|\$\$)/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (marker && !(marker === "$$" && line.trim().length > 2 && line.trim().endsWith("$$"))) { fence = marker; continue; }
    const match = /^\s{0,3}(#{1,3})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (match) headings.push({ level: match[1].length, text: plainText(match[2]), line: line.trim() });
  }
  return headings;
}

export function plainText(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
}

export function NoteOutline({ headings, onSelect }: { headings: OutlineHeading[]; onSelect: (index: number) => void }) {
  const top = Math.min(...headings.map(heading => heading.level));
  return (
    <nav className="note-outline" aria-label="Outline">
      {headings.map((heading, index) => (
        <button key={index} type="button" title={heading.text} style={{ paddingLeft: `${(heading.level - top) * 12}px` }}
          onClick={() => onSelect(index)}>{heading.text}</button>
      ))}
    </nav>
  );
}
