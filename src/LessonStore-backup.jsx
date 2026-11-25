// ═══════════════════════════════════════════════════════════
//  LessonStore.jsx  — put in src/.  The student-facing storefront:
//  free previews + prices for everyone; "Open full lesson" if granted,
//  otherwise "Request this lesson".
// ═══════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { loadCatalog, useLessonGrants, getPreviewURL, getPremiumFileURL, requestLesson } from "./premium";

export default function LessonStore({ user, courseId, onNeedSignIn }) {
  const [catalog, setCatalog] = useState(null);
  const grants = useLessonGrants(user);               // Set | null
  const [viewer, setViewer] = useState(null);          // { title, url, isBlob }
  const [busy, setBusy] = useState("");
  const [requested, setRequested] = useState(() => new Set());
  const [msg, setMsg] = useState("");
  const urlRef = useRef("");

  useEffect(() => { loadCatalog(courseId).then(setCatalog); }, [courseId]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  function closeViewer() {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; }
    setViewer(null);
  }
  async function openPreview(l) {
    setBusy("pv_" + l.id); setMsg("");
    try { const url = await getPreviewURL(l.previewPath); setViewer({ title: l.title + " — preview", url, isBlob: false }); }
    catch { setMsg("Couldn't load the preview."); }
    setBusy("");
  }
  async function openFull(l) {
    if (!user) return onNeedSignIn && onNeedSignIn();
    setBusy("full_" + l.id); setMsg("");
    try {
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; }
      const url = await getPremiumFileURL(l.fullPath);   // rules checked here
      urlRef.current = url;
      setViewer({ title: l.title, url, isBlob: true });
    } catch { setMsg("Couldn't open this lesson. If you were just granted access, give it a moment and retry."); }
    setBusy("");
  }
  async function request(l) {
    if (!user) return onNeedSignIn && onNeedSignIn();
    setBusy("req_" + l.id); setMsg("");
    try { await requestLesson(user, l.id); setRequested((s) => new Set(s).add(l.id)); setMsg("Requested “" + l.title + "”. Your teacher will unlock it after payment."); }
    catch { setMsg("Couldn't send the request — please try again."); }
    setBusy("");
  }

  if (catalog === null) return <div style={{ padding: 16, color: "#6b6a86" }}>Loading lessons…</div>;

  if (viewer) return (
    <div style={{ width: "100%", maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong>{viewer.title}</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.open(viewer.url, "_blank", "noopener")} style={btn("#6C4DF6")}>Open full screen ↗</button>
          <button onClick={closeViewer} style={btn("#9a99ad")}>Close</button>
        </div>
      </div>
      <iframe title={viewer.title} src={viewer.url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        style={{ width: "100%", height: "78vh", border: "1px solid #e6e2f7", borderRadius: 12, background: "#fff" }} />
    </div>
  );

  const owned = (grants && grants.active) || new Set();
  const expiresMs = (grants && grants.expiresMs) || {};
  const farFuture = Date.now() + 1000 * 60 * 60 * 24 * 365 * 50; // ~50y = "no limit"
  const expiryLabel = (id) => {
    const ms = expiresMs[id];
    if (!ms || ms > farFuture) return "";
    return "Expires " + new Date(ms).toLocaleDateString();
  };
  return (
    <div style={{ width: "100%", maxWidth: 820 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 2 }}>Lessons</h2>
      <p style={{ color: "#6b6a86", fontSize: 13, marginTop: 0 }}>
        Preview any lesson free. Request the ones you want and your teacher will unlock them.
      </p>
      {msg && <p style={{ fontSize: 13, color: "#0E7E69" }}>{msg}</p>}
      {catalog.length === 0 ? (
        <p style={{ color: "#9a99ad", fontSize: 14 }}>No lessons posted yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {catalog.map((l) => {
            const isOwned = owned.has(l.id);
            const isReq = requested.has(l.id);
            return (
              <div key={l.id} style={{ padding: "12px 14px", border: "1px solid #ece9f6", borderRadius: 12, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{l.title}</div>
                    {l.description && <div style={{ fontSize: 13, color: "#6b6a86", marginTop: 2 }}>{l.description}</div>}
                  </div>
                  {l.price && <span style={{ fontWeight: 800, color: "#6C4DF6", whiteSpace: "nowrap" }}>{l.price}</span>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {l.previewPath && (
                    <button disabled={busy==="pv_"+l.id} onClick={() => openPreview(l)} style={btn("#0E7E69", busy==="pv_"+l.id)}>
                      {busy==="pv_"+l.id ? "…" : "Preview (free)"}
                    </button>
                  )}
                  {isOwned ? (
                    <>
                      <button disabled={busy==="full_"+l.id} onClick={() => openFull(l)} style={btn("#6C4DF6", busy==="full_"+l.id)}>
                        {busy==="full_"+l.id ? "Opening…" : "Open full lesson"}
                      </button>
                      {expiryLabel(l.id) && <span style={{ fontSize: 12, color: "#9a99ad", alignSelf: "center" }}>{expiryLabel(l.id)}</span>}
                    </>
                  ) : isReq ? (
                    <span style={{ ...btn("#C9761E"), opacity: 0.85 }}>Requested ✓</span>
                  ) : (
                    <button disabled={busy==="req_"+l.id} onClick={() => request(l)} style={btn("#C9761E", busy==="req_"+l.id)}>
                      {busy==="req_"+l.id ? "…" : "Request this lesson"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function btn(bg, disabled) {
  return { fontWeight: 700, fontSize: 13, border: "none", borderRadius: 999, padding: "7px 15px",
           color: "#fff", background: bg, opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer" };
}
