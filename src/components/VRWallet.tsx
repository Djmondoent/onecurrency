import React, { useEffect, useMemo, useRef, useState } from 'react'

const AFRAME_URL = new URL('../lib/aframe.min.js', import.meta.url).href

declare global {
  interface Window {
    AFRAME?: any
  }
  namespace JSX {
    interface IntrinsicElements {
      'a-scene': any
      'a-assets': any
      'a-entity': any
      'a-sky': any
      'a-camera': any
      'a-animation': any
      'a-plane': any
      'a-text': any
      'a-ring': any
      'a-circle': any
      'a-light': any
      'a-cylinder': any
      'a-sphere': any
    }
  }
}

type Props = {
  open: boolean
  onClose: () => void
  priceUsd: number | null
  balanceSats: number | null
  address: string
  networkLabel: string
  onRefresh?: () => void
}

// Lazy load A-Frame only when VR mode is opened to avoid impacting normal UI
function useAframeLoader(enabled: boolean) {
  const [ready, setReady] = useState<boolean>(() => typeof window !== 'undefined' && !!window.AFRAME)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    if (!enabled) return
    if (ready) return
    let cancelled = false
    let poll: number | undefined
    setLoading(true)
    const load = async () => {
      try {
        if (typeof window !== 'undefined' && window.AFRAME) { setReady(true); return }
        let script = document.querySelector('script[data-aframe-local]') as HTMLScriptElement | null
        if (!script) {
          script = document.createElement('script')
          script.src = AFRAME_URL
          script.async = true
          script.crossOrigin = 'anonymous'
          script.dataset.aframeLocal = '1'
          document.head.appendChild(script)
        }
        const onLoad = () => { if (!cancelled) setReady(true) }
        const onError = () => { if (!cancelled) setError('Failed to load A-Frame') }
        script.addEventListener('load', onLoad, { once: true })
        script.addEventListener('error', onError, { once: true })
        // Fallback poll in case load event misses but AFRAME is ready
        poll = window.setInterval(() => {
          if (cancelled) return
          if ((window as any).AFRAME) {
            setReady(true)
            if (poll) window.clearInterval(poll)
          }
        }, 300)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load A-Frame')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; setLoading(false); if (poll) window.clearInterval(poll) }
  }, [enabled, ready])

  return { ready, error, loading }
}

export default function VRWallet({ open, onClose, priceUsd, balanceSats, address, networkLabel, onRefresh }: Props) {
  const { ready, error, loading } = useAframeLoader(open)
  const componentsReady = useRef(false)
  const sats = balanceSats ?? 0
  const btc = sats / 1e8

  const formattedPrice = useMemo(() => {
    if (!priceUsd || priceUsd <= 0) return 'Fetching price…'
    return `1 BTC = $${priceUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD`
  }, [priceUsd])

  const formattedSats = useMemo(() => sats.toLocaleString(undefined, { maximumFractionDigits: 0 }), [sats])
  const tickerText = useMemo(() => {
    return `BTC • ${formattedPrice} • Balance ${btc.toFixed(6)} BTC (${formattedSats} sats)`
  }, [formattedPrice, btc, formattedSats])

  useEffect(() => {
    if (!ready || componentsReady.current || typeof window === 'undefined' || !window.AFRAME) return
    const A = window.AFRAME
    if (!A) return

    if (!A.components['hover-glow']) {
      A.registerComponent('hover-glow', {
        schema: { color: { type: 'string', default: '#22d3ee' } },
        init() {
          const el = this.el
          const original = el.getAttribute('material') || {}
          const active = { ...original, color: this.data.color }
          const onEnter = () => el.setAttribute('material', active)
          const onLeave = () => el.setAttribute('material', original)
          el.addEventListener('mouseenter', onEnter)
          el.addEventListener('mouseleave', onLeave)
          this.remove = () => {
            el.removeEventListener('mouseenter', onEnter)
            el.removeEventListener('mouseleave', onLeave)
            el.setAttribute('material', original)
          }
        },
      })
    }

    if (!A.components['vr-wallet-button']) {
      A.registerComponent('vr-wallet-button', {
        schema: {
          label: { type: 'string', default: '' },
          color: { type: 'string', default: '#0ea5e9' },
        },
        init() {
          const el = this.el
          const textEl = document.createElement('a-entity')
          textEl.setAttribute('position', '0 0 0.01')
          textEl.setAttribute('text', `value: ${this.data.label}; color: #fff; align: center; width: 2.4`)
          el.appendChild(textEl)
          el.setAttribute('geometry', 'primitive: plane; width: 1.6; height: 0.45')
          el.setAttribute('material', `color: ${this.data.color}; opacity: 0.9`)
          el.classList.add('clickable')
        },
      })
    }

    if (!A.components['vr-locomotion']) {
      A.registerComponent('vr-locomotion', {
        schema: {
          moveStep: { type: 'number', default: 0.25 },
          turnStep: { type: 'number', default: 30 }, // degrees
          turnCooldown: { type: 'number', default: 300 }, // ms
        },
        init() {
          this.lastTurn = 0
          this.camera = document.getElementById('camera')
          this.onThumb = (evt: any) => {
            const [x, y] = evt.detail?.axes || []
            if (!this.camera) return
            const now = performance.now()
            if (Math.abs(x) > 0.7 && now - this.lastTurn > this.data.turnCooldown) {
              const sign = x > 0 ? -1 : 1 // snap turn left/right
              this.el.object3D.rotation.y += sign * (this.data.turnStep * Math.PI / 180)
              this.lastTurn = now
            }
            if (Math.abs(y) > 0.2) {
              const dir = new A.THREE.Vector3()
              this.camera.object3D.getWorldDirection(dir)
              dir.y = 0
              if (dir.lengthSq() > 0) dir.normalize()
              const step = -y * this.data.moveStep
              this.el.object3D.position.addScaledVector(dir, step)
            }
          }
          this.el.addEventListener('thumbstickmoved', this.onThumb)
          this.el.addEventListener('axismove', this.onThumb) // fallback
        },
        remove() {
          this.el.removeEventListener('thumbstickmoved', this.onThumb)
          this.el.removeEventListener('axismove', this.onThumb)
        },
      })
    }

    componentsReady.current = true
  }, [ready])

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(3,7,18,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={onClose}>Exit VR view</button>
      </div>
      <div style={{ width: '100%', height: '100%', maxWidth: '1200px', maxHeight: '720px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.45)' }}>
        {!ready && (
          <div style={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>{loading ? 'Loading VR space…' : 'VR not ready'}</div>
            {error && <div style={{ color: '#ef4444' }}>{error}</div>}
          </div>
        )}
        {ready && (
          <a-scene
            embedded
            vr-mode-ui="enabled: true"
            renderer="antialias: true; colorManagement: true; physicallyCorrectLights: true; exposure: 1.1"
            background="color: #050812"
            fog="type: exponential; density: 0.02; color: #050812"
          >
            <a-assets>
              <img id="gridTex" src="https://cdn.aframe.io/a-painter/images/floor.jpg" crossOrigin="anonymous" />
              <img id="skyGrad" src="https://cdn.aframe.io/360-image-gallery-boilerplate/img/sechelt.jpg" crossOrigin="anonymous" />
              <img id="stars" src="https://cdn.aframe.io/starry-sky/starry-sky.png" crossOrigin="anonymous" />
            </a-assets>

            <a-sky src="#skyGrad" rotation="0 -90 0"></a-sky>
            <a-entity geometry="primitive: sphere; radius: 24" material="side: back; src: #stars; opacity: 0.35" rotation="0 180 0"></a-entity>

            <a-plane
              rotation="-90 0 0"
              width="22"
              height="22"
              material="src: #gridTex; repeat: 18 18; metalness: 0; roughness: 1"
              color="#0b0f14"
            ></a-plane>
            <a-plane rotation="-90 0 0" width="6" height="14" position="0 0.02 -2" color="#0d1425" material="opacity:0.65"></a-plane>

            <a-light type="ambient" color="#6b7280"></a-light>
            <a-light type="point" color="#38bdf8" intensity="1.35" distance="12" position="0 3 -1.5"></a-light>
            <a-light type="spot" color="#f59e0b" intensity="0.9" distance="10" angle="35" position="1.5 3 -2.5" rotation="-40 -20 0"></a-light>

            <a-entity position="-3 0.6 -2.4" geometry="primitive: box; width: 0.12; height: 1.2; depth: 0.12" material="color: #0ea5e9; opacity: 0.35"></a-entity>
            <a-entity position="3 0.6 -2.4" geometry="primitive: box; width: 0.12; height: 1.2; depth: 0.12" material="color: #f59e0b; opacity: 0.35"></a-entity>

            <a-entity id="cameraRig" position="0 1.6 0" vr-locomotion>
              <a-camera
                id="camera"
                look-controls="pointerLockEnabled: true"
                wasd-controls="acceleration: 24"
              >
                <a-entity cursor="fuse: false; rayOrigin: mouse" raycaster="objects: .clickable" position="0 0 -0.1" geometry="primitive: ring; radiusInner: 0.002; radiusOuter: 0.004" material="color: #22d3ee; shader: flat"></a-entity>
                <a-entity raycaster="objects: .clickable; far: 10" cursor="fuse: false"></a-entity>
              </a-camera>
              <a-entity laser-controls="hand: right"></a-entity>
              <a-entity laser-controls="hand: left"></a-entity>
            </a-entity>

            <a-entity position="0 1.5 -2">
              <a-entity geometry="primitive: plane; width: 3.6; height: 1.8" material="color: #0c162b; opacity: 0.92; roughness: 0.6; metalness: 0.1" position="0 0 0" shadow></a-entity>
              <a-entity position="0 0.6 0.01" text={`value: OneCurrency VR | ${networkLabel}; color: #7dd3fc; align: center; width: 4.5; wrapCount: 28; zOffset: 0.01`}></a-entity>
              <a-entity position="0 0.25 0.01" text={`value: ${formattedPrice}; color: #cbd5e1; align: center; width: 4.5; wrapCount: 32`}></a-entity>
              <a-entity position="0 -0.05 0.01" text={`value: Balance: ${btc.toFixed(6)} BTC (${formattedSats} sats); color: #e5e7eb; align: center; width: 4.5; wrapCount: 34`}></a-entity>
              <a-entity position="0 -0.35 0.01" text={`value: Addr: ${address || 'Not loaded'}; color: #94a3b8; align: center; width: 4.8; wrapCount: 38`}></a-entity>
            </a-entity>

            <a-entity position="-1.8 1.1 -1.6">
              <a-plane width="1.8" height="1.2" color="#0a1224" opacity="0.92" material="roughness:0.5; metalness:0.05" class="clickable"></a-plane>
              <a-text value="Price" position="0 0.45 0.02" align="center" color="#7dd3fc" width="3"></a-text>
              <a-text value={formattedPrice} position="0 0.15 0.02" align="center" color="#e5e7eb" width="3.4"></a-text>
              <a-text value={`Balance ≈ $${priceUsd && priceUsd > 0 ? (btc * priceUsd).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '…'}`} position="0 -0.1 0.02" align="center" color="#cbd5e1" width="3.4"></a-text>
              <a-plane
                position="0 -0.4 0.02"
                width="0.9"
                height="0.22"
                color="#0d6efd"
                opacity="0.9"
                class="clickable"
                onClick={() => onRefresh && onRefresh()}
              ></a-plane>
              <a-text value="Refresh" position="0 -0.4 0.03" align="center" color="#fff" width="2"></a-text>
            </a-entity>

            <a-entity position="1.8 1.05 -1.6">
              <a-plane width="1.8" height="1.2" color="#0f172a" opacity="0.9" material="roughness:0.4; metalness:0.1"></a-plane>
              <a-text value="Controls" position="0 0.45 0.02" align="center" color="#7dd3fc" width="3"></a-text>
              <a-text value="Desktop: WASD move, mouse look (click to lock)" position="0 0.15 0.02" align="center" color="#e5e7eb" width="3.4" wrap-count="34"></a-text>
              <a-text value="VR: Thumbstick move, snap turn; laser/cursor to click" position="0 -0.15 0.02" align="center" color="#cbd5e1" width="3.4" wrap-count="34"></a-text>
            </a-entity>

            <a-entity position="0 0.6 -1.8" rotation="0 0 0">
              <a-entity geometry="primitive: box; width: 4.5; height: 0.2; depth: 0.05" material="color: #0d6efd; opacity: 0.95" position="0 0 0"></a-entity>
              <a-entity position="-2.2 0 0.06" text={`value: ${tickerText}; color: #f1f5f9; width: 10; align: left`}>
                <a-animation attribute="position" from="2.2 0 0.06" to="-2.2 0 0.06" direction="alternate" dur="6500" repeat="indefinite"></a-animation>
              </a-entity>
            </a-entity>

            <a-entity position="0 -0.1 -1.6" rotation="-5 0 0" geometry="primitive: box; width: 2.4; height: 1; depth: 0.05" material="color: #0b1220; opacity: 0.9; roughness: 0.6; metalness: 0.05">
              <a-entity position="-0.65 0.2 0.03" vr-wallet-button="label: Receive; color: #16a34a"></a-entity>
              <a-entity position="0.65 0.2 0.03" vr-wallet-button="label: Send; color: #f97316"></a-entity>
              <a-entity position="0 -0.25 0.03" geometry="primitive: plane; width: 2; height: 0.25" material="color: #0ea5e9; opacity: 0.15" hover-glow="color: #38bdf8" className="clickable">
                <a-entity position="0 0 0.01" text={`value: Tap a button with your controller; color: #cbd5e1; align: center; width: 3`}></a-entity>
              </a-entity>
            </a-entity>

            <a-entity position="0 2.1 -3" rotation="0 30 0" animation="property: rotation; to: 0 390 0; loop: true; dur: 12000; easing: linear">
              <a-ring radius-inner="0.45" radius-outer="0.65" color="#22d3ee" opacity="0.65"></a-ring>
              <a-circle radius="0.44" color="#050a16" opacity="0.9"></a-circle>
              <a-text value="ONE" align="center" color="#22d3ee" position="0 0 0.05" width="4"></a-text>
            </a-entity>

            <a-entity position="-2 0.4 -3" animation="property: position; dir: alternate; dur: 3500; loop: true; to: -2 0.7 -3">
              <a-sphere radius="0.12" color="#22d3ee" opacity="0.65"></a-sphere>
              <a-sphere radius="0.06" color="#67e8f9" position="0.18 0.08 0.05" opacity="0.8"></a-sphere>
            </a-entity>
            <a-entity position="2 0.5 -3.2" animation="property: position; dir: alternate; dur: 4200; loop: true; to: 2 0.9 -3.2">
              <a-sphere radius="0.12" color="#f59e0b" opacity="0.7"></a-sphere>
              <a-sphere radius="0.06" color="#fbbf24" position="-0.16 0.06 -0.04" opacity="0.8"></a-sphere>
            </a-entity>

            <a-entity position="0 -0.5 -1.5" className="clickable" onClick={onClose}>
              <a-entity geometry="primitive: plane; width: 0.9; height: 0.35" material="color: #ef4444; opacity: 0.9" position="0 0 0"></a-entity>
              <a-entity position="0 0 0.01" text="value: Exit; color: #fff; align: center; width: 2"></a-entity>
            </a-entity>
          </a-scene>
        )}
      </div>
    </div>
  )
}
