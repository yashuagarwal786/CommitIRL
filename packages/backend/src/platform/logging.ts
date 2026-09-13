export function logJson(level: string, fields: Record<string, unknown>): void {
  const redacted = { ...fields };
  for (const key of Object.keys(redacted)) {
    if (/token|secret|password|email|prompt|authorization/i.test(key)) {
      redacted[key] = "[redacted]";
    }
  }
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, ...redacted })}\n`);
}
