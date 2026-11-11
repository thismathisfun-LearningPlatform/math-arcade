 // ═══════════════════════════════════════════════════════════
//  auth.js  — put in src/.  Thin wrapper around Firebase Auth.
//  Real, hashed credentials managed by Google (no plaintext).
// ═══════════════════════════════════════════════════════════
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

// Set this to your owner account's UID (Authentication → Users) so the app can
// show the admin screen. The REAL admin check is in the security rules.
export const OWNER_UID = "K6tuFrxz5ET4E8menYmhyqnsk952";

export function watchUser(cb) { return onAuthStateChanged(auth, cb); }
export const isOwner = (user) => !!user && user.uid === OWNER_UID;

// Create an account and seed the user's own profile document.
export async function signUp({ email, password, firstName, lastName, courseId }) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const uid = cred.user.uid;
  if (firstName) { try { await updateProfile(cred.user, { displayName: `${firstName} ${lastName||""}`.trim() }); } catch {} }
  // NOTE: no entitlement field here — rules forbid self-setting it.
  await setDoc(doc(db, "users", uid), {
    uid, email: email.trim(), firstName: firstName||"", lastName: lastName||"",
    enrolledCourses: courseId ? [courseId] : [], createdAt: serverTimestamp(),
  }, { merge: true });
  return cred.user;
}

export async function logIn({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  // make sure a profile doc exists (for older accounts)
  try {
    const ref = doc(db, "users", cred.user.uid);
    if (!(await getDoc(ref)).exists()) await setDoc(ref, { uid: cred.user.uid, email: cred.user.email }, { merge: true });
  } catch {}
  return cred.user;
}

export function logOut() { return signOut(auth); }
