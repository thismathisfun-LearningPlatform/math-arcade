// ═══════════════════════════════════════════════════════════
//  PremiumArea.jsx  — put in src/.  The whole paid experience.
//  • Anyone can browse the store (free previews + prices).
//  • Signing in (Firebase Auth) is needed to request or open a lesson.
//  • The owner account sees the upload + per-student grant tools.
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { watchUser, logIn, signUp, logOut, isOwner } from "./auth";
import LessonStore from "./LessonStore";
import AdminGrant from "./AdminGrant";
import AdminLessonUpload from "./AdminLessonUpload";
import AdminLessons from "./AdminLessons";

export default function PremiumArea({ courseId, onBack }) {
  const [user, setUser] = useState(undefined);     // undefined=loading, null=signed-out
  const [showAuth, setShowAuth] = useState(false);
  useEffect(() => watchUser(setUser), []);
  useEffect(() => { if (user) setShowAuth(false); }, [user]); // close form once signed in

  if (user === undefined) return <Screen><p style={{ color: "#6b6a86" }}>Loading…</p></Screen>;

  if (showAuth) return <Screen><AuthForm courseId={courseId} onBack={() => setShowAuth(false)} /></Screen>;

  // Owner tools
  if (isOwner(user)) return (
    <Screen>
      <div style={{ width: "100%", maxWidth: 820 }}>
        <Bar onBack={onBack} right={<span style={{ fontSize: 13, color: "#6b6a86" }}>{user.email} · <button onClick={() => logOut()} style={linkBtn}>Sign out</button></span>} />
        <AdminLessonUpload owner={user} courseId={courseId} onDone={() => {}} />
        <div style={{ height: 18 }} />
        <AdminLessons courseId={courseId} />
        <div style={{ height: 18 }} />
        <AdminGrant owner={user} courseId={courseId} />
        <div style={{ height: 18 }} />
        <h3 style={{ fontWeight: 800 }}>Store preview (what students see)</h3>
        <LessonStore user={user} courseId={courseId} onNeedSignIn={() => {}} />
      </div>
    </Screen>
  );

  // Everyone else: the store (browsable signed-out; sign in to request/open)
  return (
    <Screen>
      <div style={{ width: "100%", maxWidth: 820 }}>
        <Bar onBack={onBack} right={
          user
            ? <span style={{ fontSize: 13, color: "#6b6a86" }}>{user.email} · <button onClick={() => logOut()} style={linkBtn}>Sign out</button></span>
            : <button onClick={() => setShowAuth(true)} style={{ ...primaryBtn, padding: "6px 14px", fontSize: 13 }}>Sign in</button>
        } />
        <LessonStore user={user || null} courseId={courseId} onNeedSignIn={() => setShowAuth(true)} />
      </div>
    </Screen>
  );
}

function AuthForm({ courseId, onBack }) {
  const [mode, setMode] = useState("login");
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
    } catch (e) { setErr(prettyAuthError(e)); }
    setBusy(false);
  }
  return (
    <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
      <Bar onBack={onBack} />
      <h2 style={{ fontWeight: 800, color: "#6C4DF6", marginBottom: 2 }}>Premium account</h2>
      <p style={{ fontSize: 13, color: "#6b6a86", marginTop: 0 }}>
        {mode === "login" ? "Sign in to request or open lessons." : "Create a free account to request lessons."}
      </p>
      {mode === "signup" && (<>
        <input style={inp} placeholder="First name" value={firstName} onChange={(e)=>setFirst(e.target.value)} />
        <input style={inp} placeholder="Last name" value={lastName} onChange={(e)=>setLast(e.target.value)} />
      </>)}
      <input style={inp} placeholder="Email" type="email" autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} />
      <input style={inp} placeholder="Password" type="password" value={password}
             onChange={(e)=>setPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&go()} />
      {err && <p style={{ color: "#C23A48", fontSize: 13 }}>{err}</p>}
      <button disabled={busy} onClick={go} style={{ ...primaryBtn, width: "100%", marginTop: 8, opacity: busy?0.5:1 }}>
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

function Screen({ children }) {
  return <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 24, background: "#F7F5FF" }}>{children}</div>;
}
function Bar({ onBack, right }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, width: "100%" }}>
    {onBack ? <button onClick={onBack} style={linkBtn}>← Back</button> : <span />}{right || <span />}</div>;
}
const inp = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e6e2f7", margin: "6px 0", fontSize: 14, boxSizing: "border-box" };
const primaryBtn = { fontWeight: 800, border: "none", borderRadius: 999, padding: "10px 20px", color: "#fff", background: "#6C4DF6", cursor: "pointer" };
const linkBtn = { background: "none", border: "none", color: "#6C4DF6", fontWeight: 700, cursor: "pointer", fontSize: 13 };
