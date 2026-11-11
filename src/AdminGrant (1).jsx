// ═══════════════════════════════════════════════════════════
//  AdminGrant.jsx  — put in src/.  Owner-only.
//  Grant/revoke FULL lessons per student. Shows which lessons each
//  student has requested, so you know what to unlock after payment.
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, getDocs, query, where, doc, getDoc, setDoc, updateDoc,
         serverTimestamp, deleteField, Timestamp } from "firebase/firestore";

const NO_LIMIT_MS = Date.parse("2999-12-31T00:00:00Z"); // sentinel for "no expiry"

export default function AdminGrant({ owner, courseId }) {
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);     // [{uid,email,name,granted:Set,requested:Set}]
  const [open, setOpen] = useState("");     // expanded student uid
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [days, setDays] = useState(30);     // access length applied when you Grant
  const [noLimit, setNoLimit] = useState(false);

  async function load() {
    setErr("");
    try {
      // lessons in this course
      const cat = [];
      const cs = await getDocs(query(collection(db, "catalog"), where("courseId", "==", courseId)));
      cs.forEach((d) => cat.push({ id: d.id, ...d.data() }));
      cat.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setCatalog(cat);

      const us = await getDocs(collection(db, "users"));
      const list = [];
      for (const d of us.docs) {
        const u = { uid: d.id, ...d.data() };
        let grantedMs = {}, requested = new Set();
        try {
          const e = await getDoc(doc(db, "entitlements", d.id));
          const m = (e.exists() && e.data().lessons) || {};
          Object.entries(m).forEach(([id, v]) => {
            grantedMs[id] = v && v.expiresAt && typeof v.expiresAt.toMillis === "function" ? v.expiresAt.toMillis() : Number(v && v.expiresAt) || 0;
          });
        } catch {}
        try { const r = await getDoc(doc(db, "requests", d.id)); if (r.exists() && Array.isArray(r.data().lessons)) requested = new Set(r.data().lessons); } catch {}
        list.push({ uid: d.id, email: u.email || "", name: `${u.firstName||""} ${u.lastName||""}`.trim(), grantedMs, requested });
      }
      list.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
      setRows(list);
    } catch (e) { setErr("Couldn't load — are you signed in as the owner? " + e.message); }
  }
  useEffect(() => { load(); }, [courseId]);

  async function toggle(uid, lessonId, grant) {
    setBusy(uid + lessonId);
    try {
      const ref = doc(db, "entitlements", uid);
      if (grant) {
        const ms = noLimit ? NO_LIMIT_MS : Date.now() + Math.max(1, Number(days) || 1) * 86400000;
        // merge into the lessons map so other grants are preserved
        await setDoc(ref, {
          lessons: { [lessonId]: { expiresAt: Timestamp.fromMillis(ms) } },
          updatedBy: owner.uid, updatedAt: serverTimestamp(),
        }, { merge: true });
        setRows((rs) => rs.map((r) => r.uid === uid ? { ...r, grantedMs: { ...r.grantedMs, [lessonId]: ms } } : r));
      } else {
        await updateDoc(ref, { ["lessons." + lessonId]: deleteField() });
        setRows((rs) => rs.map((r) => {
          if (r.uid !== uid) return r;
          const g = { ...r.grantedMs }; delete g[lessonId];
          return { ...r, grantedMs: g };
        }));
      }
    } catch (e) { setErr("Change failed: " + e.message); }
    setBusy("");
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h3 style={{ fontWeight: 800 }}>Paid access — grant lessons per student</h3>
      <p style={{ color: "#6b6a86", fontSize: 13 }}>A ✋ marks a lesson the student requested. Grant after they've paid.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", background: "#F7F5FF", border: "1px solid #e6e2f7", borderRadius: 10, margin: "6px 0 12px" }}>
        <b style={{ fontSize: 13 }}>Access length for new grants:</b>
        <label style={{ fontSize: 13, opacity: noLimit ? 0.4 : 1 }}>
          <input type="number" min="1" value={days} disabled={noLimit}
            onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))}
            style={{ width: 64, padding: "5px 8px", borderRadius: 8, border: "1px solid #e6e2f7", marginRight: 4 }} /> days
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={noLimit} onChange={(e) => setNoLimit(e.target.checked)} /> No limit
        </label>
        <span style={{ fontSize: 12, color: "#9a99ad" }}>Re-granting resets the clock. Revoke ends access immediately.</span>
      </div>
      {err && <p style={{ color: "#C23A48", fontSize: 13 }}>{err}</p>}
      {catalog.length === 0 && <p style={{ color: "#9a99ad", fontSize: 13 }}>Upload a lesson first — then you can grant it.</p>}
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.uid} style={{ border: "1px solid #ece9f6", borderRadius: 12, background: "#fff" }}>
            <button onClick={() => setOpen(open === r.uid ? "" : r.uid)}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><b>{r.name || "(no name)"}</b> <span style={{ color: "#9a99ad" }}>{r.email}</span></span>
              <span style={{ fontSize: 12, color: "#6C4DF6", fontWeight: 700 }}>
                {Object.values(r.grantedMs).filter(ms => ms > Date.now()).length} active
                {r.requested.size ? ` · ${[...r.requested].filter(x => !(r.grantedMs[x] > Date.now())).length} wanted` : ""} {open === r.uid ? "▲" : "▼"}
              </span>
            </button>
            {open === r.uid && (
              <div style={{ padding: "0 14px 12px" }}>
                {catalog.map((l) => {
                  const ms = r.grantedMs[l.id]; const now = Date.now();
                  const active = ms > now; const expired = ms && ms <= now; const wanted = r.requested.has(l.id);
                  const label = active
                    ? (ms > NO_LIMIT_MS - 86400000 ? "no limit" : "until " + new Date(ms).toLocaleDateString())
                    : expired ? "expired " + new Date(ms).toLocaleDateString() : "";
                  return (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid #f3f1fb" }}>
                      <span style={{ fontSize: 14 }}>
                        {wanted && !active ? "✋ " : ""}{l.title} {l.price && <span style={{ color: "#9a99ad" }}>· {l.price}</span>}
                        {label && <span style={{ color: expired ? "#C23A48" : "#9a99ad", fontSize: 12 }}> · {label}</span>}
                      </span>
                      <button disabled={busy === r.uid + l.id} onClick={() => toggle(r.uid, l.id, !active)}
                        style={{ fontSize: 12, fontWeight: 800, border: "none", borderRadius: 999, padding: "5px 12px", color: "#fff",
                                 background: active ? "#C23A48" : "#0E7E69", opacity: busy === r.uid + l.id ? 0.5 : 1, cursor: "pointer" }}>
                        {busy === r.uid + l.id ? "…" : active ? "Revoke" : expired ? "Re-grant" : "Grant"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p style={{ color: "#9a99ad", fontSize: 13 }}>No premium accounts yet.</p>}
      </div>
    </div>
  );
}
