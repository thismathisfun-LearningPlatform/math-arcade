// ═══════════════════════════════════════════════════════════
//  PremiumGate.jsx  — put in src/.  Wrap any premium UI with this.
//  It only controls what is SHOWN; the security rules are what
//  actually protect the data if someone bypasses the UI.
// ═══════════════════════════════════════════════════════════
import { useEntitlement } from "./premium";

export default function PremiumGate({ user, children, fallback }) {
  const { loading, active } = useEntitlement(user);
  if (loading) return <div style={{ padding: 16, color: "#6b6a86" }}>Checking your access…</div>;
  if (active) return children;
  return fallback || (
    <div style={{ padding: 20, textAlign: "center", border: "2px dashed #C9761E",
                  borderRadius: 16, background: "#FEF3C7", color: "#7A5307" }}>
      <div style={{ fontSize: 28 }}>🔒</div>
      <div style={{ fontWeight: 800, marginTop: 6 }}>This is premium content</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>
        Ask thismathisfun to unlock it for your account. Once your access is granted,
        it appears here automatically — no need to log out and back in.
      </div>
    </div>
  );
}
