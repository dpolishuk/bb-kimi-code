const HARNESS_BLOCK = /<system_(?:instructions|reminder)\b[^>]*>[\s\S]*?(?:<\/system_(?:instructions|reminder)>|$)/giu;

export function sanitizeThreadTitlePrompt(prompt: string): string {
  return prompt.replace(HARNESS_BLOCK, "").replace(/\s+/gu, " ").trim();
}

export function generateKimiTitle(prompt: string, _options?: { signal?: AbortSignal }): string {
  return sanitizeThreadTitlePrompt(prompt);
}
