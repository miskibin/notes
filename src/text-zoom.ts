export function textZoomDirection(event: KeyboardEvent): -1 | 0 | 1 | null {
  const modified = event.ctrlKey || event.metaKey;
  if (!modified || event.altKey) return null;
  const plus = event.key === "+" || event.key === "=" || event.code === "NumpadAdd" || (event.shiftKey && event.code === "Equal");
  if (plus) return 1;
  if (event.shiftKey) return null;
  if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") return -1;
  if (event.key === "0" || event.code === "Numpad0") return 0;
  return null;
}
