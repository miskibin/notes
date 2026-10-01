export type EditorSelection = { text: string; from: number; to: number; document: string };
export type EditorHandle = {
  getMarkdown: () => string;
  replaceMarkdown: (markdown: string) => void;
  getSelection: (includeEmpty?: boolean) => EditorSelection | null;
  replaceSelection: (text: string, selection: EditorSelection) => void;
  selectAll: () => void;
  insertAfterSelection: (markdown: string, selection: EditorSelection) => void;
  focus: () => void;
};
export type EditorHandleRef = { current: EditorHandle | null };
