// ═══════════════════════════════════════════════════════════
//  AdminGrant.jsx  — put in src/.  Owner-only screen to grant or
//  revoke paid access by hand. Writing entitlements/{uid} is
//  allowed by the rules ONLY for the owner account.
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection, getDocs, doc, setDoc, deleteDoc, getDoc, serverTimestamp,
} from "firebase/firestore";

export default function AdminGrant({ owner }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const us = await getDocs(collection(db, "users"));
      const list = [];
      for (const d of us.docs) {
        const u = { uid: d.id, ...d.data() };
        let active = false;
        try { const e = await getDoc(doc(db, "entitlements", d.id)); active = !!(e.exists() && e.data().active); } catch {}
        list.push({ ...u, active });
      }
      list.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
      setRows(list);
    } catch (e) { setErr("Couldn't load users — are you signed in as the owner? " + e.message); }
  }
  useEffect(() => { load(); }, []);

  async function setAccess(uid, active) {
    setBusy(uid);
    try {
      if (active) {
        await setDoc(doc(db, "entitlements", uid), {
          active: true, tier: "premium", grantedBy: owner.uid, grantedAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(doc(db, "entitlements", uid)); // or setDoc {active:false}
      }
      setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, active } : r)));
    } catch (e) { setErr("Change failed: " + e.message); }
    setBusy("");
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <h2 style={{ fontWeight: 800 }}>Paid access</h2>
      <p style={{ color: "#6b6a86", fontSize: 13 }}>
        Toggle who can see premium content. Only your owner account can change this.
      </p>
      {err && <p style={{ color: "#C23A48", fontSize: 13 }}>{err}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead><tr style={{ textAlign: "left", color: "#5538D6" }}>
          <th style={{ padding: 8 }}>Student</th><th style={{ padding: 8 }}>Email</th>
          <th style={{ padding: 8 }}>Access</th><th style={{ padding: 8 }}></th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uid} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{(r.firstName || "") + " " + (r.lastName || "")}</td>
              <td style={{ padding: 8, color: "#6b6a86" }}>{r.email}</td>
              <td style={{ padding: 8, fontWeight: 800, color: r.active ? "#0E7E69" : "#9a99ad" }}>
                {r.active ? "Premium" : "Free"}
              </td>
              <td style={{ padding: 8 }}>
                <button disabled={busy === r.uid}
                  onClick={() => setAccess(r.uid, !r.active)}
                  style={{ fontWeight: 700, borderRadius: 999, padding: "6px 14px", border: "none",
                           color: "#fff", background: r.active ? "#C23A48" : "#0E7E69",
                           opacity: busy === r.uid ? 0.5 : 1, cursor: "pointer" }}>
                  {busy === r.uid ? "…" : r.active ? "Revoke" : "Grant"}
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} style={{ padding: 12, color: "#9a99ad" }}>No users yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
