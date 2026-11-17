import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'
import WindowShell from './WindowShell'

type QrScannerProps = {
  open: boolean
  onClose: () => void
  onResult: (value: string) => void
  title?: string
  helperText?: string
  facingMode?: 'environment' | 'user'
  windowId?: string
}

const STORAGE_KEY = 'qr.selectedCamera'

export default function QrScanner({
  open,
  onClose,
  onResult,
  title = 'Scan QR code',
  helperText = 'Point your camera at the QR code. Keep it steady and well lit.',
  facingMode = 'environment',
  windowId = 'qrScanner',
}: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [request, setRequest] = useState(() => {
    let deviceId = ''
    try { deviceId = localStorage.getItem(STORAGE_KEY) || '' } catch {}
    return { deviceId, attempt: 0 }
  })

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { id?: string } | undefined
      if (detail?.id === windowId) onClose()
    }
    document.addEventListener('window:close', handler)
    return () => document.removeEventListener('window:close', handler)
  }, [onClose, windowId])

  useEffect(() => {
    if (!open) return
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    let completed = false
    let stream: MediaStream | undefined
    let controls: IScannerControls | undefined

    const stop = () => {
      controls?.stop()
      stream?.getTracks().forEach(track => track.stop())
      video.srcObject = null
    }

    const start = async () => {
      setError('')
      setStarting(true)
      setDevices([])
      try {
        if (!window.isSecureContext) throw new Error('Open this wallet over HTTPS to use the camera.')
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera. Try your phone’s browser, or paste your backup text.')

        // Request permission first: device lists can be empty until access is granted.
        // An ideal device ID also permits fallback if a previously saved camera is gone.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: request.deviceId
            ? { deviceId: { ideal: request.deviceId } }
            : { facingMode: { ideal: facingMode } },
        })
        if (cancelled) { stop(); return }

        const deviceId = stream.getVideoTracks()[0]?.getSettings().deviceId || ''
        setSelectedDeviceId(deviceId)
        if (deviceId) {
          try { localStorage.setItem(STORAGE_KEY, deviceId) } catch {}
        }
        // Listing cameras is optional and must never prevent scanning.
        BrowserMultiFormatReader.listVideoInputDevices().then(list => {
          if (!cancelled && !completed) setDevices(list)
        }).catch(() => {})

        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromStream(stream, video, (result, _error, scannerControls) => {
          const value = result?.getText()
          if (!value || cancelled || completed) return
          completed = true
          scannerControls.stop()
          stop()
          onResultRef.current(value)
        })
        if (cancelled || completed) { stop(); return }
        setStarting(false)
      } catch (e: any) {
        stop()
        if (cancelled) return
        const messages: Record<string, string> = {
          NotAllowedError: 'Camera access was blocked. Allow camera access for this site in your browser settings, then tap Retry.',
          NotFoundError: 'No camera was found. Connect a camera, or paste your backup text.',
          NotReadableError: 'The camera is busy or unavailable. Close other apps using it, then tap Retry.',
        }
        setError(messages[e?.name] || e?.message || 'Failed to start camera. Tap Retry to try again.')
        setStarting(false)
      }
    }

    void start()
    return () => { cancelled = true; stop() }
  }, [open, facingMode, request])

  if (!open) return null

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 16, overflowY: 'auto' }}>
      <WindowShell id={windowId} title={title} style={{ width: 'min(560px, 92vw)' }}>
        <div className="kv">{helperText}</div>
        {devices.length > 1 && (
          <label style={{ display: 'block', marginTop: 8 }}>
            Camera
            <select
              className="input"
              value={selectedDeviceId}
              disabled={starting}
              onChange={(e) => {
                const deviceId = e.target.value
                setSelectedDeviceId(deviceId)
                setRequest(previous => ({ deviceId, attempt: previous.attempt + 1 }))
              }}
            >
              {devices.map((d, index) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${index + 1}`}</option>
              ))}
            </select>
          </label>
        )}
        <div style={{ marginTop: 8 }}>
          <video key={request.attempt} ref={videoRef} style={{ width: '100%', maxHeight: 320, background: '#000', borderRadius: 8 }} autoPlay muted playsInline />
        </div>
        {starting && <div role="status" style={{ marginTop: 8 }}>Opening camera… Allow camera access if your browser asks.</div>}
        {error && <div role="alert" className="alert" style={{ marginTop: 8 }}>{error}</div>}
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" disabled={starting} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button>
        </div>
      </WindowShell>
    </div>,
    document.body,
  )
}
