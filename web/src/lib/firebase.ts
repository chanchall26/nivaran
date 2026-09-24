/**
 * Firebase is optional. With VITE_FIREBASE_* set, reports/deliveries/pulses live in
 * Firestore (shared, real-time) and AI goes through Firebase AI Logic (Gemini).
 * Without it, the app runs fully in "demo mode" on browser storage.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const firebaseEnabled = Boolean(config.apiKey && config.projectId && config.appId)

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null
let signedIn: Promise<unknown> | null = null

export function firebase() {
  if (!firebaseEnabled) return null
  if (!app) {
    app = initializeApp(config)
    db = getFirestore(app)
    auth = getAuth(app)
    // anonymous auth: lets Firestore rules require a signed-in caller without asking
    // a guard or a passer-by to create an account
    signedIn = signInAnonymously(auth).catch((e) => console.warn('Anonymous sign-in failed', e))
  }
  return { app: app!, db: db!, auth: auth!, ready: signedIn! }
}
