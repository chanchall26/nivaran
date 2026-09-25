/**
 * One small repository for the three things Barahmasa writes: reports, deliveries
 * (help that was sent) and pulse checks (did it work?). Firestore when configured,
 * localStorage otherwise; the rest of the app can't tell the difference.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { firebase } from './firebase'
import type { Colony, Delivery, PulseCheck, Report, TreeSpot } from './types'

export type CollectionName = 'reports' | 'deliveries' | 'pulses' | 'spots' | 'colonies'
interface Docs {
  reports: Report
  deliveries: Delivery
  pulses: PulseCheck
  spots: TreeSpot
  colonies: Colony
}
type DocOf<C extends CollectionName> = Docs[C]

const LS_PREFIX = 'barahmasa:'
const listeners = new Map<CollectionName, Set<() => void>>()
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

function lsRead<C extends CollectionName>(c: C): DocOf<C>[] {
  try {
    return JSON.parse(localStorage.getItem(LS_PREFIX + c) ?? '[]')
  } catch {
    return []
  }
}
function lsWrite(c: CollectionName, rows: unknown[]) {
  try {
    localStorage.setItem(LS_PREFIX + c, JSON.stringify(rows))
  } catch (e) {
    console.warn('localStorage full or blocked', e)
  }
  listeners.get(c)?.forEach((f) => f())
}
if (typeof window !== 'undefined') {
  // keep two tabs of the demo in sync
  window.addEventListener('storage', (e) => {
    const c = e.key?.startsWith(LS_PREFIX) ? (e.key.slice(LS_PREFIX.length) as CollectionName) : null
    if (c) listeners.get(c)?.forEach((f) => f())
  })
}

let firestoreOk: boolean | null = null

/** Firestore when configured AND signed in; null means use browser storage. */
async function remote() {
  const fb = firebase()
  if (!fb) return null
  firestoreOk = await fb.ready
  return firestoreOk ? fb : null
}

function localSubscribe<C extends CollectionName>(c: C, cb: (rows: DocOf<C>[]) => void) {
  const fire = () => cb(lsRead(c))
  if (!listeners.has(c)) listeners.set(c, new Set())
  listeners.get(c)!.add(fire)
  fire()
  return () => {
    listeners.get(c)!.delete(fire)
  }
}

/** Firestore rejects undefined fields; strip them. */
const clean = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

export const store = {
  get mode(): 'firebase' | 'local' {
    return firebase() && firestoreOk !== false ? 'firebase' : 'local'
  },

  subscribe<C extends CollectionName>(c: C, cb: (rows: DocOf<C>[]) => void): () => void {
    if (!firebase()) return localSubscribe(c, cb)
    let unsub = () => {}
    let cancelled = false
    remote().then((fb) => {
      if (cancelled) return
      unsub = fb
        ? onSnapshot(
            collection(fb.db, c),
            (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as DocOf<C>), id: d.id }))),
            (err) => console.warn(`Firestore ${c}`, err),
          )
        : localSubscribe(c, cb)
    })
    return () => {
      cancelled = true
      unsub()
    }
  },

  async add<C extends CollectionName>(c: C, row: Omit<DocOf<C>, 'id'>): Promise<DocOf<C>> {
    const fb = await remote()
    if (fb) {
      const ref = await addDoc(collection(fb.db, c), clean(row as object))
      return { ...(row as object), id: ref.id } as DocOf<C>
    }
    const saved = { ...(row as object), id: uid() } as DocOf<C>
    lsWrite(c, [...lsRead(c), saved])
    return saved
  },

  async addMany<C extends CollectionName>(c: C, rows: Omit<DocOf<C>, 'id'>[]): Promise<void> {
    const fb = await remote()
    if (fb) {
      for (let i = 0; i < rows.length; i += 400) {
        const batch = writeBatch(fb.db)
        for (const r of rows.slice(i, i + 400)) batch.set(doc(collection(fb.db, c)), clean(r as object))
        await batch.commit()
      }
      return
    }
    lsWrite(c, [...lsRead(c), ...rows.map((r) => ({ ...(r as object), id: uid() }))])
  },

  async update<C extends CollectionName>(c: C, id: string, patch: Partial<DocOf<C>>): Promise<void> {
    const fb = await remote()
    if (fb) {
      await updateDoc(doc(fb.db, c, id), clean(patch as object))
      return
    }
    lsWrite(c, lsRead(c).map((r) => (r.id === id ? { ...r, ...patch } : r)))
  },

  /** Remove everything seeded by the demo button, leaving real submissions alone. */
  async clearDemo(): Promise<void> {
    const fb = await remote()
    for (const c of ['reports', 'deliveries', 'pulses', 'spots', 'colonies'] as CollectionName[]) {
      if (fb) {
        const snap = await getDocs(query(collection(fb.db, c), where('demo', '==', true)))
        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
      } else {
        lsWrite(c, lsRead(c).filter((r) => !(r as { demo?: boolean }).demo))
      }
    }
  },
}
