// ═══════════════════════════════════════════════════════════
//  premium.js  — put in src/.  Entitlement + gated content.
//  Every function here is backed by security rules; the client
//  code only decides what to *show*, the rules decide what can
//  be *read*.
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { db, storage } from "./firebase";
import { doc, onSnapshot, getDocs, collection, query, where } from "firebase/firestore";
import { ref, getBlob } from "firebase/storage";

// Live entitlement for the signed-in user. Returns {loading, active}.
// Reads entitlements/{uid}; rules let a user read only their own.
export function useEntitlement(user) {
  const [state, setState] = useState({ loading: true, active: false });
  useEffect(() => {
    if (!user) { setState({ loading: false, active: false }); return; }
    const unsub = onSnapshot(
      doc(db, "entitlements", user.uid),
      (snap) => setState({ loading: false, active: !!(snap.exists() && snap.data().active) }),
      () => setState({ loading: false, active: false }) // denied/offline → treat as not subscribed
    );
    return unsub;
  }, [user]);
  return state;
}

// Load premium in-app problems for a course. A non-subscriber's request is
// REJECTED by the rules (returns []), so premium questions never reach them —
// and they are NOT in the app bundle, so they can't be scraped from the code.
export async function loadPremiumProblems(courseId) {
  try {
    const snap = await getDocs(query(collection(db, "premiumContent"), where("courseId", "==", courseId)));
    const rows = [];
    snap.forEach((d) => rows.push({ _id: d.id, ...d.data() }));
    return rows;
  } catch {
    return []; // permission denied → show nothing
  }
}

// Fetch a premium file (video/PDF) as an object URL the <video>/<a> can use.
// Uses getBlob (authenticated, rule-checked per request) — NOT getDownloadURL,
// whose token would keep working for anyone it's shared with.
export async function getPremiumFileURL(path) {
  const blob = await getBlob(ref(storage, path)); // throws if rules deny
  return URL.createObjectURL(blob); // remember to URL.revokeObjectURL(url) when done
}
