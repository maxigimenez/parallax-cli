export function normalizeHeadingText(text: string) {
  return text.replace(/`([^`]+)`/g, "$1").trim();
}
