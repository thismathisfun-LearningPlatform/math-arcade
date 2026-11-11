// ═══════════════════════════════════════════════════════════
//  AdminLessonUpload.jsx  — put in src/.  Owner-only.
//  Upload a lesson: full file (gated) + optional free preview +
//  a price, and publish it to the public catalog.
// ═══════════════════════════════════════════════════════════
import { useState } from "react";
import { db, storage } from "./firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

export default function AdminLessonUpload({ owner, courseId, onDone }) {
  const [full, setFull] = useState(null);
  const [preview, setPreview] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [order, setOrder] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!full) { setMsg("Choose the full lesson .html file."); return; }
    if (!title.trim()) { setMsg("Give the lesson a title."); return; }
    setBusy(true); setMsg("");
    try {
      const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
      const lessonId = `${slug || "lesson"}_${Date.now().toString(36)}`;
      const fullPath = `premium/lessons/${lessonId}/${full.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await uploadBytes(ref(storage, fullPath), full, { contentType: "text/html" });

      let previewPath = "";
      if (preview) {
        previewPath = `public/previews/${lessonId}/${preview.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        await uploadBytes(ref(storage, previewPath), preview, { contentType: "text/html" });
      }

      await setDoc(doc(db, "catalog", lessonId), {
        courseId, title: title.trim(), description: description.trim(), price: price.trim(),
        fullPath, previewPath, order: order === "" ? 0 : Number(order),
        uploadedBy: owner.uid, createdAt: serverTimestamp(),
      });

      setMsg("✓ Published. It now shows in the store; grant it to students from Paid access.");
      setFull(null); setPreview(null); setTitle(""); setDescription(""); setPrice(""); setOrder("");
      if (onDone) onDone();
    } catch (e) {
      setMsg("Upload failed: " + e.message + " (signed in as owner? Storage rules deployed?)");
    }
    setBusy(false);
  }

  const inp = { width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid #e6e2f7", marginTop: 6, fontSize: 14, boxSizing: "border-box" };
  const lab = { fontSize: 13, fontWeight: 700, display: "block", marginTop: 10 };
  return (
    <div style={{ maxWidth: 560, padding: 16, border: "1px solid #ece9f6", borderRadius: 14 }}>
      <h3 style={{ fontWeight: 800, marginTop: 0 }}>Add a lesson</h3>
      <p style={{ color: "#6b6a86", fontSize: 13 }}>For <b>{courseId}</b>. The full file is locked; the preview (if any) is shown free.</p>
      <label style={lab}>Full lesson (.html) — locked
        <input type="file" accept=".html,text/html" onChange={(e) => setFull(e.target.files[0] || null)} style={inp} /></label>
      <label style={lab}>Free preview (.html) — optional, shown to everyone
        <input type="file" accept=".html,text/html" onChange={(e) => setPreview(e.target.files[0] || null)} style={inp} /></label>
      <label style={lab}>Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder="e.g. Rational Functions — Lesson 1" /></label>
      <label style={lab}>Description (optional)
        <input value={description} onChange={(e) => setDescription(e.target.value)} style={inp} /></label>
      <label style={lab}>Price (shown to students)
        <input value={price} onChange={(e) => setPrice(e.target.value)} style={inp} placeholder="e.g. $15" /></label>
      <label style={lab}>Order (optional)
        <input value={order} onChange={(e) => setOrder(e.target.value.replace(/[^0-9]/g, ""))} style={inp} placeholder="0, 1, 2…" /></label>
      <button disabled={busy} onClick={upload}
        style={{ marginTop: 14, fontWeight: 800, border: "none", borderRadius: 999, padding: "10px 20px", color: "#fff", background: "#6C4DF6", opacity: busy ? 0.5 : 1, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Uploading…" : "Publish lesson"}
      </button>
      {msg && <p style={{ fontSize: 13, marginTop: 10, color: msg.startsWith("✓") ? "#0E7E69" : "#C23A48" }}>{msg}</p>}
    </div>
  );
}
