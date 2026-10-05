import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  User 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocFromServer,
  deleteDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch, 
  runTransaction,
  onSnapshot, 
  disableNetwork, 
  enableNetwork, 
  setLogLevel
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Silence verbose Firestore debug logs and backoff retry warnings
try {
  setLogLevel("silent");
} catch {}

// Initialize the Firebase App singleton
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Initialize Firestore for the specified database
const dbName = firebaseConfig.firestoreDatabaseId || "(default)";
export const db = getFirestore(app, dbName);

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// Guard against repeated unhandled rejection popups when daily Firestore write quota is reached,
// transient stream assertion occurs, or Vite HMR websocket closes in the iframe container
if (typeof window !== "undefined") {
  const isIgnorableError = (msg: string, code?: string) => {
    return (
      code === "resource-exhausted" ||
      code === "auth/popup-closed-by-user" ||
      msg.includes("resource-exhausted") ||
      msg.includes("Quota limit exceeded") ||
      msg.includes("Quota exceeded") ||
      msg.includes("Free daily write units") ||
      msg.includes("INTERNAL ASSERTION FAILED") ||
      msg.includes("da08") ||
      msg.includes("popup-closed-by-user") ||
      msg.includes("WebSocket closed without opened") ||
      msg.includes("failed to connect to websocket") ||
      msg.includes("WebSocket closed")
    );
  };

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason || "");
    const code = reason?.code;
    if (isIgnorableError(msg, code)) {
      event.preventDefault(); // Prevent uncaught promise error from spamming console or dialog
      event.stopImmediatePropagation?.();
    }
  });

  window.addEventListener("error", (event) => {
    const msg = event.message || event.error?.message || String(event.error || "");
    if (isIgnorableError(msg)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
  });

  // Filter out quota backoff noise, websocket disconnects, and internal stream assertion warnings from console
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.error = (...args: any[]) => {
    const str = args.map((a) => (typeof a === "object" ? (a?.message || JSON.stringify(a)) : String(a))).join(" ");
    if (
      str.includes("resource-exhausted") ||
      str.includes("Quota limit exceeded") ||
      str.includes("Using maximum backoff delay") ||
      str.includes("Free daily write units") ||
      str.includes("INTERNAL ASSERTION FAILED") ||
      str.includes("da08") ||
      str.includes("popup-closed-by-user") ||
      str.includes("WebSocket closed without opened") ||
      str.includes("failed to connect to websocket")
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    const str = args.map((a) => (typeof a === "object" ? (a?.message || JSON.stringify(a)) : String(a))).join(" ");
    if (
      str.includes("resource-exhausted") ||
      str.includes("Quota limit exceeded") ||
      str.includes("Using maximum backoff delay") ||
      str.includes("Free daily write units") ||
      str.includes("INTERNAL ASSERTION FAILED") ||
      str.includes("da08") ||
      str.includes("popup-closed-by-user") ||
      str.includes("WebSocket closed without opened") ||
      str.includes("failed to connect to websocket")
    ) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  };
}

export { 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  doc, 
  setDoc, 
  getDoc, 
  getDocFromServer,
  deleteDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch, 
  runTransaction,
  onSnapshot, 
  disableNetwork, 
  enableNetwork,
  setLogLevel
};
export type { User };
