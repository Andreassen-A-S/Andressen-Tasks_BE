// Comment messages store mentions as `@[Name](userId)` tokens (see mobile lib/mentions.ts
// buildTokenTextFromRanges). Anywhere that text reaches a user directly — push notifications,
// reply-quote previews — it must be converted back to plain `@Name` display text first.
const MENTION_TOKEN_PATTERN = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function tokenToDisplayText(text: string): string {
  return text.replace(MENTION_TOKEN_PATTERN, "@$1");
}
