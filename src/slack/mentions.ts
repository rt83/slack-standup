/**
 * The Slack user id in an escaped mention. Slack sends `@jane` in command text as
 * `<@U0123ABC>` or `<@U0123ABC|jane>`; a plain `@jane` is not a mention and gives null.
 */
export function parseMention(token: string): string | null {
  return /^<@([A-Z0-9]+)(?:\|[^>]*)?>$/i.exec(token)?.[1] ?? null;
}
