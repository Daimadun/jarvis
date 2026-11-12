import { useEffect, useRef, useState } from 'react'
import { raiseHudAlert } from '../lib/hudAlert'

/**
 * Live data from jarvis-tools (api.py): next shift, trains, budget, job pipeline,
 * next admin deadline, revision session. Also turns phone alerts into the red HUD alert.
 * Renders nothing if jarvis-tools isn't running.
 */
const BASE = (import.meta.env.VITE_JARVIS_TOOLS_URL as string | undefined) ?? 'http://127.0.0.1:8791'

type Hud = {
  items: { label: string; value: string; warn?: boolean }[]
  alert: { id: number; text: string } | null
}

export function LiveRail() {
  const [data, setData] = useState<Hud | null>(null)
  const lastAlert = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch(`${BASE}/hud`, { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        const j = (await r.json()) as Hud
        if (!alive) return
        setData(j)
        if (j.alert) {
          if (lastAlert.current !== null && j.alert.id > lastAlert.current) raiseHudAlert(j.alert.text, 10000)
          lastAlert.current = j.alert.id
        }
      } catch {
        if (alive) setData(null)
      }
    }
    void load()
    const id = setInterval(load, 15000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (!data || data.items.length === 0) return null
  return (
    <div className="live-rail">
      <div className="rail-title">LIVE</div>
      {data.items.map((it) => (
        <div key={it.label} className={`live-item${it.warn ? ' warn' : ''}`}>
          <span className="live-label">{it.label}</span>
          <span className="live-value">{it.value}</span>
        </div>
      ))}
    </div>
  )
}
