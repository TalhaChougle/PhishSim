const BASE = "https://phishsim-backend.onrender.com/api";

const req = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
};

export const api = {
  getCampaigns:     ()         => req("GET",    "/campaigns"),
  getCampaign:      (id)       => req("GET",    `/campaigns/${id}`),
  createCampaign:   (data)     => req("POST",   "/campaigns", data),
  deleteCampaign:   (id)       => req("DELETE", `/campaigns/${id}`),
  sendEmails:       (id)       => req("POST",   `/campaigns/${id}/send`),
  getStats:         (id)       => req("GET",    `/campaigns/${id}/stats`),
  getEvents:        (id)       => req("GET",    `/campaigns/${id}/events`),
  simulateClick:    (cid, tid) => req("POST",   `/campaigns/${cid}/simulate-click`,  { targetId: tid }),
  simulateSubmit:   (cid, tid) => req("POST",   `/campaigns/${cid}/simulate-submit`, { targetId: tid }),
};

/**
 * Open an SSE stream for a campaign.
 * Returns a cleanup function — call it to close the connection.
 *
 * handlers = {
 *   onConnected({ stats, targets, events })  — initial state snapshot
 *   onClick({ target, stats, timestamp })    — a target clicked the link
 *   onSubmit({ target, stats, timestamp })   — a target submitted credentials
 *   onSent({ target, stats, timestamp })     — an email was sent
 *   onError(err)                             — optional error handler
 * }
 */
export function openStream(campaignId, handlers) {
  const url = `${BASE}/campaigns/${campaignId}/stream`;
  const es = new EventSource(url);

  es.addEventListener("connected", (e) => {
    try { handlers.onConnected?.(JSON.parse(e.data)); } catch {}
  });

  es.addEventListener("click", (e) => {
    try { handlers.onClick?.(JSON.parse(e.data)); } catch {}
  });

  es.addEventListener("submit", (e) => {
    try { handlers.onSubmit?.(JSON.parse(e.data)); } catch {}
  });

  es.addEventListener("sent", (e) => {
    try { handlers.onSent?.(JSON.parse(e.data)); } catch {}
  });

  es.onerror = (err) => {
    handlers.onError?.(err);
    // EventSource auto-reconnects on error — no manual retry needed
  };

  // Return cleanup
  return () => es.close();
}
