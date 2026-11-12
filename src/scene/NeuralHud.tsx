import { useEffect, useRef } from 'react'
import { useStore, accentFor, type Phase } from '../store'
import { currentHudAlert } from '../lib/hudAlert'

/**
 * The "neural" reactor: a 3D neural globe inside a voice spectrum ring,
 * segmented instrument rings, a radar sweep, orbiting satellites and a red
 * alert mode. Drawn on a 2D canvas that replaces the WebGL scene while
 * ui.reactor.style === 'neural'.
 *
 * Like the WebGL scene it never re-renders through React: one requestAnimationFrame
 * loop reads the store imperatively (phase, level, ui) and paints.
 */


const TAU = Math.PI * 2

function hexToRgb(css: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim())
  if (m) {
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const r = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(css)
  if (r) return [+r[1], +r[2], +r[3]]
  return [79, 209, 255]
}

const SPEED: Record<Phase, number> = {
  offline: 0.15, boot: 2.2, dormant: 0.45, waking: 2.6,
  listening: 1, thinking: 2.4, tooling: 3, speaking: 1.1,
}

const BASE_AMP: Record<Phase, number> = {
  offline: 0, boot: 0.1, dormant: 0.02, waking: 0.15,
  listening: 0.08, thinking: 0.12, tooling: 0.15, speaking: 0.1,
}

export function NeuralHud() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current!
    const c = cv.getContext('2d')!
    let W = 0, H = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      W = cv.width = Math.round(window.innerWidth * dpr)
      H = cv.height = Math.round(window.innerHeight * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // Fibonacci sphere + neighbour links = the neural globe.
    const N = 520
    const pts: [number, number, number][] = []
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r])
    }
    const links: [number, number][] = []
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const a = pts[i], b = pts[j]
        if ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < 0.03) links.push([i, j])
      }
    const sats = [...Array(5)].map((_, i) => ({ r: 1.55 + i * 0.12, s: 0.3 + Math.random() * 0.6, o: Math.random() * 6, tilt: 0.3 + i * 0.12 }))

    let raf = 0, t = 0, last = performance.now(), amp = 0, boot = 0
    let col: [number, number, number] = [79, 209, 255]
    let lastPhase: Phase = 'offline', lastEffect = 0, glitch = 0
    const grid = document.createElement('canvas')
    let gridKey = ''

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))
      last = now
      const { phase, level, ui } = useStore.getState()
      const r = ui.reactor
      const alertState = currentHudAlert()
      const alerting = alertState.until > now
      if ((phase === 'boot' || phase === 'waking') && lastPhase !== phase) boot = 0
      lastPhase = phase
      boot = Math.min(1, boot + dt / 1.6)
      if (ui.effect && ui.effect.at !== lastEffect) {
        lastEffect = ui.effect.at
        if (ui.effect.kind === 'glitch') glitch = 0.6
      }

      const target = alerting ? [255, 60, 60] : hexToRgb(r.color ?? accentFor(phase, ui))
      for (let i = 0; i < 3; i++) col[i] += (target[i] - col[i]) * Math.min(1, dt * 4)
      const power = phase === 'offline' ? 0.35 : phase === 'dormant' ? 0.7 : 1
      const I = Math.max(0.2, Math.min(2, r.intensity)) * power
      const rgb = (a: number) => `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${Math.max(0, Math.min(1, a * I))})`

      const live = phase === 'listening' || phase === 'speaking' ? level : 0
      const want = Math.max(BASE_AMP[phase], live * (phase === 'speaking' ? 1 : 0.7), alerting ? 0.4 : 0)
      amp += (want - amp) * Math.min(1, dt * 10)
      const sp = SPEED[phase] * Math.max(0, r.spin)
      t += dt

      c.clearRect(0, 0, W, H)
      const ox = W / 2, oy = H * 0.48, R = Math.min(W, H) * 0.13 * Math.max(0.2, Math.min(3, r.scale)), s = dpr
      const ease = 1 - Math.pow(1 - boot, 3)

      // hex grid, cached until the size or the colour changes
      const gkey = `${W}x${H}:${(col[0] >> 3)},${(col[1] >> 3)},${(col[2] >> 3)}:${(I * 10) | 0}`
      if (gkey !== gridKey) {
        gridKey = gkey
        grid.width = W
        grid.height = H
        const g = grid.getContext('2d')!
        g.lineWidth = 0.5 * s
        g.strokeStyle = rgb(0.045)
        g.beginPath()
        const hs = 30 * s
        for (let y = 0, row = 0; y < H + hs; y += hs * 0.86, row++)
          for (let x = row % 2 ? hs / 2 : 0; x < W + hs; x += hs)
            for (let k = 0; k <= 6; k++) {
              const a = (k * Math.PI) / 3, px = x + Math.cos(a) * hs * 0.45, py = y + Math.sin(a) * hs * 0.45
              if (k) g.lineTo(px, py)
              else g.moveTo(px, py)
            }
        g.stroke()
      }
      c.drawImage(grid, 0, 0)
      if (!r.visible) return

      // neural globe
      const ay = t * 0.5 * sp, ax = 0.35 + Math.sin(t * 0.3) * 0.15
      const speaking = phase === 'speaking'
      const pr = pts.map(([x, y, z]) => {
        const X = x * Math.cos(ay) - z * Math.sin(ay), Z0 = x * Math.sin(ay) + z * Math.cos(ay)
        const Y = y * Math.cos(ax) - Z0 * Math.sin(ax), Z = y * Math.sin(ax) + Z0 * Math.cos(ax)
        const w = (1 + Math.sin(t * 4 + y * 6) * amp * 0.16 * (speaking ? Math.random() * 0.5 + 0.75 : 1)) * (0.55 + 0.45 * ease)
        const p = 1 / (1.8 - Z * 0.5)
        return [ox + X * R * w * p * 1.4, oy + Y * R * w * p * 1.4, Z] as const
      })
      c.lineWidth = 0.6 * s
      for (let b = 0; b < 3; b++) {
        c.beginPath()
        for (const [i, j] of links) {
          const z = (pr[i][2] + pr[j][2]) / 2, bucket = z < -0.33 ? 0 : z < 0.33 ? 1 : 2
          if (bucket !== b) continue
          c.moveTo(pr[i][0], pr[i][1])
          c.lineTo(pr[j][0], pr[j][1])
        }
        c.strokeStyle = rgb([0.06, 0.14, 0.28][b] * ease)
        c.stroke()
      }
      for (let b = 0; b < 2; b++) {
        c.beginPath()
        for (const p of pr) {
          if ((p[2] > 0 ? 1 : 0) !== b) continue
          const rr = (b ? 1.7 : 0.9) * s
          c.moveTo(p[0] + rr, p[1])
          c.arc(p[0], p[1], rr, 0, TAU)
        }
        c.fillStyle = rgb((b ? 0.95 : 0.35) * ease)
        c.fill()
      }

      // voice spectrum ring
      const B = 128, r0 = R * 1.38
      c.lineWidth = 2 * s
      c.beginPath()
      for (let i = 0; i < B; i++) {
        const a = (i / B) * TAU - Math.PI / 2
        const v = Math.abs(Math.sin(t * 7 + i * 0.7) * Math.cos(t * 3 + i * 0.31)) * amp + 0.03
        const l = v * R * 0.6 * ease
        c.moveTo(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0)
        c.lineTo(ox + Math.cos(a) * (r0 + l), oy + Math.sin(a) * (r0 + l))
      }
      c.strokeStyle = rgb(0.6)
      c.stroke()

      // segmented rings
      const seg = (rad: number, n: number, gap: number, rot: number, w: number, a: number) => {
        c.lineWidth = w * s
        c.strokeStyle = rgb(a * ease)
        c.beginPath()
        for (let i = 0; i < n; i++) {
          if (i / n > ease) break
          const a0 = rot + (i * TAU) / n
          c.moveTo(ox + Math.cos(a0) * rad, oy + Math.sin(a0) * rad)
          c.arc(ox, oy, rad, a0, a0 + TAU / n - gap)
        }
        c.stroke()
      }
      const think = phase === 'thinking' || phase === 'tooling'
      seg(R * 1.95, 6, 0.18, t * 0.4 * sp, 2, 0.55)
      seg(R * 2.08, 24, 0.12, -t * 0.25 * sp, 1, 0.35)
      seg(R * 1.25, 3, 0.5, -t * (think ? 2 : 0.7) * sp, 1.5, 0.6)
      c.lineWidth = 1.5 * s
      c.strokeStyle = rgb(0.85 * ease)
      c.beginPath()
      c.arc(ox, oy, R * 1.5 * (1 + amp * 0.3), 0, TAU)
      c.stroke()

      // tick marks
      c.lineWidth = 1 * s
      c.strokeStyle = rgb(0.4 * ease)
      c.beginPath()
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU + t * 0.1, l = i % 6 ? 4 : 9
        c.moveTo(ox + Math.cos(a) * R * 2.2, oy + Math.sin(a) * R * 2.2)
        c.lineTo(ox + Math.cos(a) * (R * 2.2 + l * s), oy + Math.sin(a) * (R * 2.2 + l * s))
      }
      c.stroke()

      // radar sweep
      const sw = (t * 1.2 * Math.max(0.5, sp)) % TAU
      c.lineWidth = 2 * s
      for (let k = 0; k < 10; k++) {
        c.strokeStyle = rgb(0.3 * (1 - k / 10) * ease)
        c.beginPath()
        c.arc(ox, oy, R * 2.14, sw - k * 0.05, sw - k * 0.05 + 0.05)
        c.stroke()
      }

      // satellites
      for (const o of sats) {
        const a = t * o.s * Math.max(0.3, sp) + o.o
        c.strokeStyle = rgb(0.07 * ease)
        c.lineWidth = 0.5 * s
        c.beginPath()
        c.ellipse(ox, oy, R * o.r, R * o.r * o.tilt, 0, 0, TAU)
        c.stroke()
        c.fillStyle = rgb(0.9 * ease)
        c.beginPath()
        c.arc(ox + Math.cos(a) * R * o.r, oy + Math.sin(a) * R * o.r * o.tilt, 2 * s, 0, TAU)
        c.fill()
      }

      // alert message under the reactor
      if (alerting) {
        const on = Math.sin(t * 10) > 0 ? 1 : 0.35
        c.font = `${13 * s}px ui-monospace, Menlo, monospace`
        c.textAlign = 'center'
        c.fillStyle = rgb(on)
        c.fillText('ALERT', ox, oy + R * 2.5)
        c.font = `${11 * s}px ui-monospace, Menlo, monospace`
        c.fillStyle = rgb(0.8 * on)
        c.fillText(alertState.text.slice(0, 80).toUpperCase(), ox, oy + R * 2.5 + 16 * s)
      }

      if (glitch > 0) {
        glitch -= dt
        for (let i = 0; i < 3; i++) {
          const y = Math.random() * (H - 30 * s), h = (4 + Math.random() * 16) * s
          try { c.drawImage(cv, 0, y, W, h, (Math.random() - 0.5) * 28 * s, y, W, h) } catch { /* ignore */ }
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="scene neural-hud" aria-hidden="true" />
}
