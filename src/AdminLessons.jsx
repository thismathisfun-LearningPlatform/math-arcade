// ═══════════════════════════════════════════════════════════
//  AdminLessons.jsx  — put in src/.  Owner-only.
//  Lists published lessons for a course and lets you UNPUBLISH one
//  for everyone: deletes its catalog entry (removes it from the store
//  and its free preview) and its Storage files (full lesson + preview).
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { db, storage } from "./firebase";
import { collection, getDocs, query, where, doc, deleteDoc } from "firebase/firestore";
import { ref, listAll, deleteObject } from "firebase/storage";

export default function AdminLessons({ courseId, onChange }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const snap = await getDocs(query(collection(db, "catalog"), where("courseId", "==", courseId)));
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.title || "").localeCompare(b.title || ""));
      setRows(list);
    } catch (e) { setErr("Couldn't load lessons: " + e.message); }
  }
  useEffect(() => { load(); }, [courseId]);

  async function unpublish(l) {
    if (!window.confirm(`Unpublish “${l.title}”? This removes the lesson AND its free preview for everyone. This cannot be undone.`)) return;
    setBusy(l.id); setErr("");
    try {
      // delete every file under the lesson's folders (full + preview)
      for (const base of [`premium/lessons/${l.id}`, `public/previews/${l.id}`]) {
        try {
          const res = await listAll(ref(storage, base));
          await Promise.all(res.items.map((it) => deleteObject(it)));
        } catch { /* folder may not exist (e.g. no preview) — ignore */ }
      }
      // remove it from the store for everyone
      await deleteDoc(doc(db, "catalog", l.id));
      setRows((rs) => rs.filter((x) => x.id !== l.id));
      if (onChange) onChange();
    } catch (e) { setErr("Couldn't unpublish: " + e.message); }
    setBusy("");
  }

  if (rows === null) return <div style={{ color: "#6b6a86", fontSize: 13 }}>Loading published lessons…</div>;

  return (
    <div style={{ maxWidth: 680 }}>
      <h3 style={{ fontWeight: 800 }}>Published lessons</h3>
      <p style={{ color: "#6b6a86", fontSize: 13 }}>Unpublishing removes a lesson and its preview from the store for everyone.</p>
      {err && <p style={{ color: "#C23A48", fontSize: 13 }}>{err}</p>}
      {rows.length === 0 ? (
        <p style={{ color: "#9a99ad", fontSize: 13 }}>No lessons published for this course yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #ece9f6", borderRadius: 12, background: "#fff" }}>
              <span style={{ fontSize: 14 }}><b>{l.title}</b> {l.price && <span style={{ color: "#9a99ad" }}>· {l.price}</span>} {l.previewPath ? "" : <span style={{ color: "#9a99ad", fontSize: 12 }}>(no preview)</span>}</span>
              <button disabled={busy === l.id} onClick={() => unpublish(l)}
                style={{ fontSize: 12, fontWeight: 800, border: "none", borderRadius: 999, padding: "6px 14px", color: "#fff", background: "#C23A48", opacity: busy === l.id ? 0.5 : 1, cursor: "pointer" }}>
                {busy === l.id ? "Removing…" : "Unpublish"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
