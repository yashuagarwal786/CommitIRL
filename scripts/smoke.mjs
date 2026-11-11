const apiUrl = process.env.API_URL ?? "http://localhost:3001";
const email = process.env.SMOKE_EMAIL ?? `smoke-${Date.now()}@commitirl.local`;
const timezone = process.env.SMOKE_TIMEZONE ?? "UTC";

function localDate(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = response.status === 204 ? undefined : await response.json();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed (${response.status}): ${body?.error?.message ?? "unknown error"}`);
  }
  return body;
}

const session = await request("/v1/dev/session", {
  method: "POST",
  body: JSON.stringify({ email, displayName: "Smoke Test" }),
});
const authorization = { Authorization: `Bearer ${session.data.token}` };

let me = await request("/v1/me", { headers: authorization });
if (!me.data.onboarded) {
  await request("/v1/me/onboarding", {
    method: "POST",
    headers: { ...authorization, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      name: "Smoke Test",
      timezone,
      locale: "en",
      adultEligibility: true,
      termsAccepted: true,
      privacyAcknowledged: true,
    }),
  });
  me = await request("/v1/me", { headers: authorization });
}

const preferences = await request("/v1/me/preferences", { headers: authorization });
const updatedPreferences = await request("/v1/me/preferences", {
  method: "PATCH",
  headers: { ...authorization, "If-Match": `\"${preferences.data.version}\"` },
  body: JSON.stringify({ quietHours: { start: "22:00", end: "07:00" } }),
});
if (updatedPreferences.data.quietHours.start !== "22:00" || updatedPreferences.data.quietHours.end !== "07:00") {
  throw new Error("Expected quiet-hour preferences to persist.");
}

const commitment = await request("/v1/commitments", {
  method: "POST",
  headers: { ...authorization, "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({
    title: "CommitIRL smoke workflow",
    category: "LEARNING",
    sensitivity: "STANDARD",
    visibility: "PRIVATE",
    timezone,
    target: { operator: "GTE", value: 30, unit: "MINUTES" },
    schedule: {
      cadence: "DAILY",
      localStartDate: localDate(timezone),
      localDeadlineTime: "23:59",
    },
    verificationMethods: [
      { provider: "IN_APP_SESSION", priority: 1, configuration: {} },
      { provider: "SELF_REPORT", priority: 2, configuration: {} },
    ],
  }),
});

const attempts = await request("/v1/attempts", { headers: authorization });
const attempt = attempts.data.find((item) => item.commitmentId === commitment.data.id);
if (!attempt || attempt.state !== "ACTIVE") {
  throw new Error("Expected a newly-created active attempt for the smoke commitment.");
}

const progress = await request(`/v1/attempts/${attempt.id}/progress-events`, {
  method: "POST",
  headers: { ...authorization, "If-Match": `"${attempt.version}"`, "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ type: "PROGRESS_SET", value: 30, unit: "MINUTES" }),
});

await request(`/v1/attempts/${attempt.id}/self-reports`, {
  method: "POST",
  headers: { ...authorization, "If-Match": `"${progress.data.version}"` },
  body: JSON.stringify({ choice: "KEPT" }),
});

const resolved = await request(`/v1/attempts/${attempt.id}`, { headers: authorization });
if (resolved.data.state !== "RESOLVED" || resolved.data.outcome !== "COMPLETED") {
  throw new Error("Expected the smoke attempt to resolve as completed after a kept self-report.");
}

const currentUser = await request("/v1/me", { headers: authorization });
const deletion = await request("/v1/me", {
  method: "DELETE",
  headers: { ...authorization, "If-Match": `\"${currentUser.data.version}\"` },
  body: JSON.stringify({ confirmation: "DELETE" }),
});
if (deletion.data.accountStatus !== "PENDING_DELETION") {
  throw new Error("Expected the account deletion request to enter its recovery window.");
}

const cancelledDeletion = await request("/v1/me/deletion-cancellation", {
  method: "POST",
  headers: { ...authorization, "If-Match": "\"1\"" },
  body: JSON.stringify({ deletionRequestId: deletion.data.deletionRequestId, confirmation: "KEEP_MY_ACCOUNT" }),
});
if (cancelledDeletion.data.accountStatus !== "ACTIVE") {
  throw new Error("Expected the deletion cancellation to reactivate the account.");
}

console.log(JSON.stringify({
  status: "ok",
  userId: me.data.id,
  commitmentId: commitment.data.id,
  attemptId: attempt.id,
  outcome: resolved.data.outcome,
}, null, 2));
