// ═══════════════════════════════════════════════════════════
//  PremiumArea.jsx  — put in src/.  ONE drop-in that contains the
//  whole paid-content experience, so App.jsx only has to mount it.
//
//  • Signs a student in with Firebase Authentication (real, hashed
//    accounts) — separate from the free-practice login, so it does
//    not touch your working app.
//  • Shows the premium Lessons, gated by the subscriber entitlement.
//  • For your OWNER account, shows the "grant access" screen and the
//    lesson uploader.
//  The actual lock is the Firestore/Storage security rules; this UI
//  only decides what to show.
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { watchUser, logIn, signUp, logOut, isOwner } from "./auth";
import { useEntitlement } from "./premium";
import Lessons from "./Lessons";
import AdminGrant from "./AdminGrant";
import AdminLessonUpload from "./AdminLessonUpload";

export default function PremiumArea({ courseId, onBack }) {
  const [user, setUser] = useState(undefined); // undefined = still loading
  useEffect(() => watchUser(setUser), []);

  if (user === undefined) return <Screen><p style={{ color: "#6b6a86" }}>Loading…</p></Screen>;
  if (!user) return <Screen><AuthForm courseId={courseId} onBack={onBack} /></Screen>;
  return <Screen><Inside user={user} courseId={courseId} onBack={onBack} /></Screen>;
}

function Inside({ user, courseId, onBack }) {
  const { loading, active } = useEntitlement(user);
  const owner = isOwner(user);
  return (
    <div style={{ width: "100%", maxWidth: 820 }}>
      <Bar onBack={onBack} right={
        <span style={{ fontSize: 13, color: "#6b6a86" }}>
          {user.email} · <button onClick={() => logOut()} style={linkBtn}>Sign out</button>
        </span>
      }/>
      {owner ? (
        <>
          <AdminLessonUpload owner={user} courseId={courseId} onDone={() => {}} />
          <div style={{ height: 18 }} />
          <AdminGrant owner={user} />
          <div style={{ height: 18 }} />
          <h3 style={{ fontWeight: 800 }}>Preview lessons</h3>
          <Lessons user={user} courseId={courseId} />
        </>
      ) : loading ? (
        <p style={{ color: "#6b6a86" }}>Checking your access…</p>
      ) : active ? (
        <Lessons user={user} courseId={courseId} />
      ) : (
        <div style={lockBox}>
          <div style={{ fontSize: 30 }}>🔒</div>
          <div style={{ fontWeight: 800, marginTop: 6 }}>You're signed in — access not active yet</div>
          <div style={{ fontSize: 13, marginTop: 4, color: "#7A5307" }}>
            Ask thismathisfun to turn on premium for <b>{user.email}</b>. Once it's granted it appears here
            automatically — no need to sign out and back in.
          </div>
        </div>
      )}
    </div>
  );
}

function AuthForm({ courseId, onBack }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr(""); setBusy(true);
    try {
      if (mode === "signup") await signUp({ email, password, firstName, lastName, courseId });
      else await logIn({ email, password });
      // watchUser in the parent picks up the signed-in user automatically.
    } catch (e) {
      setErr(prettyAuthError(e));
    }
    setBusy(false);
  }

  return (
    <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
      <Bar onBack={onBack} />
      <h2 style={{ fontWeight: 800, color: "#6C4DF6", marginBottom: 2 }}>Premium Lessons</h2>
      <p style={{ fontSize: 13, color: "#6b6a86", marginTop: 0 }}>
        {mode === "login" ? "Sign in to view your lessons." : "Create your premium account."}
      </p>
      {mode === "signup" && (
        <>
          <input style={inp} placeholder="First name" value={firstName} onChange={(e)=>setFirst(e.target.value)} />
          <input style={inp} placeholder="Last name" value={lastName} onChange={(e)=>setLast(e.target.value)} />
        </>
      )}
      <input style={inp} placeholder="Email" type="email" autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} />
      <input style={inp} placeholder="Password" type="password" autoComplete="current-password" value={password}
             onChange={(e)=>setPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&go()} />
      {err && <p style={{ color: "#C23A48", fontSize: 13 }}>{err}</p>}
      <button disabled={busy} onClick={go} style={{ ...primaryBtn, opacity: busy?0.5:1, width: "100%", marginTop: 8 }}>
        {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <button onClick={() => { setMode(mode==="login"?"signup":"login"); setErr(""); }} style={{ ...linkBtn, marginTop: 10 }}>
        {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </div>
  );
}

function prettyAuthError(e) {
  const c = (e && e.code) || "";
  if (c.includes("email-already-in-use")) return "That email already has an account — try signing in.";
  if (c.includes("invalid-email")) return "Please enter a valid email address.";
  if (c.includes("weak-password")) return "Password should be at least 6 characters.";
  if (c.includes("wrong-password") || c.includes("invalid-credential")) return "Email or password is incorrect.";
  if (c.includes("user-not-found")) return "No account with that email — create one.";
  if (c.includes("too-many-requests")) return "Too many attempts. Wait a moment and try again.";
  return (e && e.message) || "Something went wrong. Please try again.";
}

// ── little styling helpers ──
function Screen({ children }) {
  return <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "flex-start",
                       padding: 24, background: "#F7F5FF" }}>{children}</div>;
}
function Bar({ onBack, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      {onBack ? <button onClick={onBack} style={linkBtn}>← Back</button> : <span />}
      {right || <span />}
    </div>
  );
}
const inp = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e6e2f7", margin: "6px 0", fontSize: 14, boxSizing: "border-box" };
const primaryBtn = { fontWeight: 800, border: "none", borderRadius: 999, padding: "10px 20px", color: "#fff", background: "#6C4DF6", cursor: "pointer" };
const linkBtn = { background: "none", border: "none", color: "#6C4DF6", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const lockBox = { padding: 20, textAlign: "center", border: "2px dashed #C9761E", borderRadius: 16, background: "#FEF3C7", color: "#7A5307" };
