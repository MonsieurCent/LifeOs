import React, { useState } from "react";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut
} from "../lib/firebase";
import { updateProfile, sendPasswordResetEmail } from "firebase/auth";
import { 
  Dumbbell, 
  Mail, 
  Lock, 
  User as UserIcon, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2,
  RefreshCw
} from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

type AuthMode = "login" | "register" | "reset";

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setSuccessMsg("Signed in successfully with Google!");
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (err: any) {
      const msg = err?.message || String(err);
      const code = err?.code || "";
      if (code === "auth/popup-closed-by-user" || msg.includes("popup-closed-by-user")) {
        // User voluntarily closed the Google sign-in window — gracefully reset without error
        return;
      }
      console.warn("Google sign in notice:", err);
      setError(msg || "Failed to sign in with Google.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || (!password && mode !== "reset")) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setSuccessMsg("Logged in successfully!");
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      } else if (mode === "register") {
        if (password.length < 6) {
          setError("Password should be at least 6 characters.");
          setLoading(false);
          return;
        }
        const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        sessionStorage.setItem("pulse_trigger_onboarding", "true");
        if (fullName.trim() && userCred.user) {
          try {
            await updateProfile(userCred.user, { displayName: fullName.trim() });
          } catch (e) {}
        }
        setSuccessMsg("Account created successfully!");
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      } else if (mode === "reset") {
        await sendPasswordResetEmail(auth, email.trim());
        setSuccessMsg("Password reset email sent! Check your inbox.");
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      const msg = err?.message || String(err);
      const code = err?.code || "";
      if (code === "auth/operation-not-allowed" || msg.includes("operation-not-allowed")) {
        setError("Email/Password accounts are currently disabled in this Firebase project. Please use 'Continue with Google', or enable Email/Password under Authentication > Sign-in method in the Firebase Console.");
      } else if (msg.includes("user-not-found") || msg.includes("invalid-credential")) {
        setError("Invalid email or password. Please try again.");
      } else if (msg.includes("email-already-in-use")) {
        setError("An account with this email already exists. Try logging in instead.");
      } else if (msg.includes("weak-password")) {
        setError("Password is too weak. Please use at least 6 characters.");
      } else if (msg.includes("invalid-email")) {
        setError("Please enter a valid email address.");
      } else {
        setError(msg || "Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Brand Header */}
        <div className="p-6 bg-gradient-to-br from-[#222222] via-[#2A2A2A] to-[#121212] text-white text-center space-y-3 relative">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#AD314D] to-[#68172C] mx-auto flex items-center justify-center text-white shadow-md">
            <Dumbbell className="w-6 h-6 text-white" />
          </div>

          <div>
            <div className="flex items-center justify-center gap-2">
              <span className="font-extrabold text-xl tracking-tight text-white">
                PULSE
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-white/10 text-rose-200">
                Fitness Intelligence
              </span>
            </div>
            <p className="text-xs text-neutral-300 mt-1">
              Isolated private cloud storage &amp; real-time kinesiologist sync
            </p>
          </div>

          {/* Mode toggle pills */}
          <div className="flex items-center justify-center bg-white/10 p-1 rounded-2xl border border-white/10 max-w-[280px] mx-auto">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); setSuccessMsg(null); }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
                mode === "login"
                  ? "bg-white text-[#222222] shadow-xs"
                  : "text-neutral-300 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(null); setSuccessMsg(null); }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
                mode === "register"
                  ? "bg-white text-[#222222] shadow-xs"
                  : "text-neutral-300 hover:text-white"
              }`}
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          
          {/* Status feedback alerts */}
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Google 1-Click Login Option */}
          {mode !== "reset" && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl border border-black/[0.12] hover:bg-neutral-50 active:scale-98 text-[#222222] text-xs font-bold transition-all flex items-center justify-center gap-2.5 shadow-2xs cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="relative flex items-center my-2">
                <div className="flex-grow border-t border-black/[0.08]" />
                <span className="flex-shrink mx-3 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  or email login
                </span>
                <div className="flex-grow border-t border-black/[0.08]" />
              </div>
            </>
          )}

          {/* Email / Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            {mode === "register" && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 block">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Alex Rivera"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/[0.1] text-xs font-semibold text-[#222222] placeholder:text-neutral-400 focus:outline-none focus:border-[#AD314D] focus:ring-1 focus:ring-[#AD314D]"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 block">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/[0.1] text-xs font-semibold text-[#222222] placeholder:text-neutral-400 focus:outline-none focus:border-[#AD314D] focus:ring-1 focus:ring-[#AD314D]"
                />
              </div>
            </div>

            {mode !== "reset" && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 block">
                    Password
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => { setMode("reset"); setError(null); setSuccessMsg(null); }}
                      className="text-[11px] font-semibold text-[#AD314D] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/[0.1] text-xs font-semibold text-[#222222] placeholder:text-neutral-400 focus:outline-none focus:border-[#AD314D] focus:ring-1 focus:ring-[#AD314D]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#AD314D] to-[#8C1E37] hover:brightness-110 active:scale-98 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Authenticating...</span>
                </>
              ) : mode === "login" ? (
                <>
                  <span>Sign In to LifeOS</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : mode === "register" ? (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Create Account &amp; Setup Storage</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 text-white" />
                  <span>Send Reset Email</span>
                </>
              )}
            </button>
          </form>

          {mode === "reset" && (
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); setSuccessMsg(null); }}
              className="w-full text-center text-xs font-semibold text-neutral-600 hover:text-[#222222] pt-2"
            >
              ← Back to Sign In
            </button>
          )}

          {/* Privacy & Security guarantee */}
          <div className="p-3 rounded-2xl bg-[#FAF9F8] border border-black/[0.05] flex items-center gap-2.5 text-[11px] text-neutral-600 mt-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Your workouts, profiles, and health data are strictly isolated to your private Firebase account under <code className="font-mono text-[10px] bg-neutral-200/60 px-1 py-0.5 rounded">/users/{'{uid}'}</code>.
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};
