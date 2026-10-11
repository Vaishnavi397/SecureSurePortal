// Structured JSON logs to stdout. On ECS the awslogs driver ships stdout to CloudWatch.
// Rule: never pass secrets or customer personal data in `meta`.
function log(level, msg, meta = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  if (level === "error") console.error(line);
  else console.log(line);
}
export const logger = {
  info: (m, x) => log("info", m, x),
  warn: (m, x) => log("warn", m, x),
  error: (m, x) => log("error", m, x),
};
