// ═══════════════════════════════════════════════════════════
//  AdminLessonUpload.jsx  — put in src/.  Owner-only.
//  Upload an interactive-lesson HTML file to the gated Storage
//  folder and register it in the lesson catalog. Both writes are
//  allowed by the rules ONLY for your owner account.
// ═══════════════════════════════════════════════════════════
import { useState } from "react";
import { db, storage } from "./firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

export default function AdminLessonUpload({ owner, courseId, onDone }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) { setMsg("Choose an .html lesson file first."); return; }
    if (!title.trim()) { setMsg("Give the lesson a title."); return; }
    setBusy(true); setMsg("");
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `premium/lessons/${courseId}/${Date.now()}_${safeName}`;
      // Upload the HTML into the gated Storage folder (premium/ → subscribers only).
      await uploadBytes(ref(storage, path), file, { contentType: "text/html" });
      // Register it in the catalog (premiumContent → subscribers read, admin writes).
      await addDoc(collection(db, "premiumContent"), {
        type: "lesson", courseId, title: title.trim(), description: description.trim(),
        storagePath: path, order: order === "" ? 0 : Number(order),
        uploadedBy: owner.uid, createdAt: serverTimestamp(),
      });
      setMsg("✓ Lesson uploaded and published to subscribers.");
      setFile(null); setTitle(""); setDescription(""); setOrder("");
      if (onDone) onDone();
    } catch (e) {
      setMsg("Upload failed: " + e.message + " (are you signed in as the owner, and are Storage rules deployed?)");
    }
    setBusy(false);
  }

  const inp = { width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid #e6e2f7", marginTop: 6, fontSize: 14 };
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 16, border: "1px solid #ece9f6", borderRadius: 14 }}>
      <h3 style={{ fontWeight: 800, marginTop: 0 }}>Add a premium lesson</h3>
      <p style={{ color: "#6b6a86", fontSize: 13 }}>Uploads the HTML to the subscriber-only folder for <b>{courseId}</b>.</p>
      <label style={{ fontSize: 13, fontWeight: 700 }}>Lesson file (.html)
        <input type="file" accept=".html,text/html" onChange={(e) => setFile(e.target.files[0] || null)} style={inp} />
      </label>
      <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginTop: 10 }}>Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder="e.g. Rational Functions — Lesson 1" />
      </label>
      <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginTop: 10 }}>Description (optional)
        <input value={description} onChange={(e) => setDescription(e.target.value)} style={inp} />
      </label>
      <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginTop: 10 }}>Order (optional)
        <input value={order} onChange={(e) => setOrder(e.target.value.replace(/[^0-9]/g, ""))} style={inp} placeholder="0, 1, 2…" />
      </label>
      <button disabled={busy} onClick={upload}
        style={{ marginTop: 14, fontWeight: 800, border: "none", borderRadius: 999, padding: "10px 20px",
                 color: "#fff", background: "#6C4DF6", opacity: busy ? 0.5 : 1, cursor: busy ? "default" : "pointer" }}>
        {busy ? "Uploading…" : "Upload lesson"}
      </button>
      {msg && <p style={{ fontSize: 13, marginTop: 10, color: msg.startsWith("✓") ? "#0E7E69" : "#C23A48" }}>{msg}</p>}
    </div>
  );
}
