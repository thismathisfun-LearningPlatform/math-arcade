// ═══════════════════════════════════════════════════════════
//  premium.js  — put in src/.  Storefront model:
//  • catalog (public: title, price, preview)   — anyone can browse
//  • entitlements/{uid}.lessons = [lessonId…]   — which FULL lessons a
//    student may open (owner-written only)
//  • requests/{uid}.lessons = [lessonId…]       — lessons a student asked for
//  The security rules enforce all of this; this file is just the client API.
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { db, storage } from "./firebase";
import { doc, onSnapshot, getDocs, collection, query, where,
         setDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { ref, getBlob, getDownloadURL } from "firebase/storage";

// Public catalog for a course (works even when signed out).
export async function loadCatalog(courseId) {
  try {
    const snap = await getDocs(query(collection(db, "catalog"), where("courseId", "==", courseId)));
    const rows = [];
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.title || "").localeCompare(b.title || ""));
    return rows;
  } catch { return []; }
}

// Live view of this student's lesson grants, with per-lesson expiry.
// Returns { active: Set(ids still valid now), expiresMs: {id: ms} } or null while loading.
// entitlements/{uid}.lessons is a map: { <lessonId>: { expiresAt: Timestamp } }.
export function useLessonGrants(user) {
  const [grants, setGrants] = useState(null);
  useEffect(() => {
    if (!user) { setGrants({ active: new Set(), expiresMs: {} }); return; }
    const unsub = onSnapshot(
      doc(db, "entitlements", user.uid),
      (s) => {
        const lessons = (s.exists() && s.data().lessons) || {};
        const now = Date.now(); const active = new Set(); const expiresMs = {};
        Object.entries(lessons).forEach(([id, v]) => {
          const ms = v && v.expiresAt && typeof v.expiresAt.toMillis === "function"
            ? v.expiresAt.toMillis() : Number(v && v.expiresAt) || 0;
          expiresMs[id] = ms;
          if (ms > now) active.add(id);           // expired grants simply drop out
        });
        setGrants({ active, expiresMs });
      },
      () => setGrants({ active: new Set(), expiresMs: {} })
    );
    return unsub;
  }, [user]);
  return grants;
}

// Preview files live in public storage → a normal download URL is fine.
export async function getPreviewURL(path) {
  if (!path) return "";
  return await getDownloadURL(ref(storage, path));
}

// Full lessons are gated → fetch with getBlob so the rules are checked
// on every request (never a shareable download URL).
export async function getPremiumFileURL(path) {
  const blob = await getBlob(ref(storage, path));
  return URL.createObjectURL(blob);
}

// A student flags a lesson they want. Records interest only — it does NOT
// grant access (rules forbid that); you grant after payment.
export async function requestLesson(user, lessonId) {
  if (!user) throw new Error("sign-in-required");
  await setDoc(doc(db, "requests", user.uid), {
    uid: user.uid, email: user.email || "",
    lessons: arrayUnion(lessonId), updatedAt: serverTimestamp(),
  }, { merge: true });
}
