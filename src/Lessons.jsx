// ═══════════════════════════════════════════════════════════
//  Lessons.jsx  — put in src/.  The subscriber-facing premium
//  "Lessons" area: lists the interactive HTML lessons and opens
//  each one through the AUTHENTICATED, rule-checked fetch.
//
//  Security: the lesson catalog lives in Firestore `premiumContent`
//  (rules: subscribers read) and each lesson's HTML lives in
//  Storage under `premium/…` (rules: subscribers read, via getBlob).
//  A non-subscriber's requests are denied by the rules, so there is
//  nothing to hide-and-hope — the data never reaches them. There is
//  no public URL, so nothing to share.
//
//  Wrap this with <PremiumGate user={user}> in your app for a clean
//  locked-state message; the gate is cosmetic, the rules are the lock.
// ═══════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getPremiumFileURL } from "./premium";

export default function Lessons({ user, courseId }) {
  const [list, setList] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [openUrl, setOpenUrl] = useState("");
  const [openTitle, setOpenTitle] = useState("");
  const [busy, setBusy] = useState("");
  const urlRef = useRef("");

  // Load the lesson catalog for this course (rule-gated to subscribers).
  useEffect(() => {
    let alive = true;
    (async () => {
      setError(""); setList(null);
      try {
        const snap = await getDocs(query(
          collection(db, "premiumContent"),
          where("courseId", "==", courseId),
          where("type", "==", "lesson"),
        ));
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.title || "").localeCompare(b.title || ""));
        if (alive) setList(rows);
      } catch {
        // permission denied (not subscribed) or offline → show nothing
        if (alive) { setList([]); }
      }
    })();
    return () => { alive = false; };
  }, [courseId, user]);

  // Clean up the object URL when the viewer closes / unmounts.
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  async function openLesson(lesson) {
    setBusy(lesson.id); setError("");
    try {
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; }
      const url = await getPremiumFileURL(lesson.storagePath); // getBlob → rules checked here
      urlRef.current = url;
      setOpenUrl(url); setOpenTitle(lesson.title || "Lesson");
    } catch {
      setError("Couldn't open this lesson. If you were just granted access, give it a moment and try again.");
    }
    setBusy("");
  }

  function closeLesson() {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; }
    setOpenUrl(""); setOpenTitle("");
  }

  if (list === null) return <div style={{ padding: 16, color: "#6b6a86" }}>Loading lessons…</div>;

  // ── Viewer ──
  if (openUrl) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <strong style={{ fontSize: 15 }}>{openTitle}</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.open(openUrl, "_blank", "noopener")}
              style={btn("#6C4DF6")}>Open full screen ↗</button>
            <button onClick={closeLesson} style={btn("#9a99ad")}>Close</button>
          </div>
        </div>
        <iframe
          title={openTitle}
          src={openUrl}
          // Trusted first-party content (your own lessons). Scripts allowed so the
          // interactive features work; the blob URL has its own opaque origin.
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
          style={{ width: "100%", height: "78vh", border: "1px solid #e6e2f7", borderRadius: 12, background: "#fff" }}
        />
      </div>
    );
  }

  // ── List ──
  return (
    <div>
      <h2 style={{ fontWeight: 800, marginBottom: 4 }}>Lessons</h2>
      <p style={{ color: "#6b6a86", fontSize: 13, marginTop: 0 }}>Interactive premium lessons for this course.</p>
      {error && <p style={{ color: "#C23A48", fontSize: 13 }}>{error}</p>}
      {list.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", border: "2px dashed #C9761E",
                      borderRadius: 16, background: "#FEF3C7", color: "#7A5307" }}>
          <div style={{ fontSize: 26 }}>🔒</div>
          <div style={{ fontWeight: 800, marginTop: 6 }}>No lessons available</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            If you expect premium lessons here, ask thismathisfun to unlock your account — they'll appear automatically.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {list.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                                     gap: 10, padding: "12px 14px", border: "1px solid #ece9f6", borderRadius: 12, background: "#fff" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{l.title || "Untitled lesson"}</div>
                {l.description && <div style={{ fontSize: 12, color: "#6b6a86" }}>{l.description}</div>}
              </div>
              <button disabled={busy === l.id} onClick={() => openLesson(l)} style={btn("#0E7E69", busy === l.id)}>
                {busy === l.id ? "Opening…" : "Open"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function btn(bg, disabled) {
  return { fontWeight: 700, fontSize: 14, border: "none", borderRadius: 999, padding: "8px 16px",
           color: "#fff", background: bg, opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer" };
}
