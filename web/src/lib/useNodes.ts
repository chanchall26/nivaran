import { useEffect, useState } from 'react'
import type { NightRow, NodesFile } from './nodes'

interface NodeData {
  nodes: NodesFile['nodes']
  meta: NodesFile['meta']
  nights: NightRow[]
}

let cache: Promise<NodeData> | null = null
const load = () =>
  (cache ??= Promise.all([
    fetch('/data/gwalior/nodes.json').then((r) => r.json() as Promise<NodesFile>),
    fetch('/data/gwalior/winter_nights.json').then((r) => r.json() as Promise<{ nights: NightRow[] }>),
  ]).then(([n, w]) => ({ nodes: n.nodes, meta: n.meta, nights: w.nights })))

/** Exposure Nodes + the real winter they are replayed against (loaded once, on first use). */
export function useNodes() {
  const [data, setData] = useState<NodeData | null>(null)
  useEffect(() => {
    let alive = true
    load().then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [])
  return data
}
