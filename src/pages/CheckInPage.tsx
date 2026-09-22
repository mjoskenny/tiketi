import { useEffect, useRef, useState } from 'react'
import { ArrowLeftIcon, CheckIcon, CameraIcon, XIcon } from '../components/Icon'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'

type Props = { navigate: (p: string) => void }
type ScanResult = 'valid' | 'used' | 'invalid' | 'declined' | 'error' | null
type ScanData = { event_title: string | null; holder_name: string | null; ticket_name: string | null; checked_in_at: string | null }

const AlertIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

export default function CheckInPage({ navigate }: Props) {
  const { organizer } = useAuth()
  const [inputCode, setInputCode] = useState('')
  const [result, setResult] = useState<ScanResult>(null)
  const [resultData, setResultData] = useState<ScanData | null>(null)
  const [scanError, setScanError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanCount, setScanCount] = useState(0)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerRef = useRef<IScannerControls | null>(null)
  const scanRef = useRef<(code: string) => void>(() => {})
  const decodedRef = useRef(false)

  const loadScanCount = async () => {
    if (!organizer?.id) return
    const { data } = await supabase
      .from('tickets')
      .select('id, events!inner(organizer_id)')
      .eq('events.organizer_id', organizer.id)
      .eq('status', 'used')
    setScanCount(data?.length ?? 0)
  }

  useEffect(() => {
    void loadScanCount()
    if (!organizer?.id) return
    const channel = supabase.channel(`check-in-tickets:${organizer.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets' }, () => { void loadScanCount() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [organizer?.id])

  useEffect(() => {
    if (!cameraOpen) return
    let active = true
    const startCamera = async () => {
      try {
        setCameraError('')
        decodedRef.current = false
        if (!videoRef.current) return
        const reader = new BrowserQRCodeReader()
        scannerRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          videoRef.current,
          (result, error) => {
            if (!active || !result || decodedRef.current) return
            decodedRef.current = true
            scannerRef.current?.stop()
            scannerRef.current = null
            setCameraOpen(false)
            scanRef.current(result.getText())
          },
        )
      } catch {
        setCameraError('Camera access was blocked. Allow camera access in your browser settings, then try again.')
      }
    }
    void startCamera()
    return () => { active = false; scannerRef.current?.stop(); scannerRef.current = null }
  }, [cameraOpen])

  const handleScan = async (code: string) => {
    const normalizedCode = code.trim()
    if (!normalizedCode) return
    setScanning(true)
    setResult(null)
    setResultData(null)
    setScanError('')
    const { data, error } = await supabase.rpc('check_in_ticket', { p_qr_code: normalizedCode })
    setScanning(false)
    if (error) {
      setScanError(error.message)
      setResult('error')
      return
    }
    const ticket = Array.isArray(data) ? data[0] : data
    if (!ticket) { setResult('invalid'); return }
    const nextData: ScanData = ticket
    setResultData(nextData)
    setResult(ticket.ticket_status === 'used' ? 'used' : ticket.ticket_status === 'valid' ? 'valid' : ticket.ticket_status === 'cancelled' ? 'declined' : 'invalid')
    if (ticket.ticket_status !== 'used') await loadScanCount()
  }

  scanRef.current = (code: string) => { void handleScan(code) }

  const reset = () => { setResult(null); setResultData(null); setScanError(''); setInputCode(''); setScanning(false); setCameraError('') }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060606', color: '#fff' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => navigate('dashboard')} className="flex items-center gap-2 text-sm"
          style={{ color: 'var(--muted-foreground)' }}>
          <ArrowLeftIcon size={14} /> Dashboard
        </button>
        <p className="font-black text-lg" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--primary)' }}>TIKETI Check-in</p>
        <div className="text-right">
          <p className="font-bold text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>{scanCount}</p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>checked in</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>Live ticket scanner</p>
          <h2 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{organizer?.name ?? 'Organizer events'}</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Scan a valid ticket QR code to check guests in.</p>
        </div>

        {/* Scanner */}
        {result === null && (
          <div className="w-full max-w-sm">
            <div className="relative rounded-3xl overflow-hidden mb-6 flex items-center justify-center"
              style={{ height: 280, background: '#0a0a0a', border: `2px solid ${scanning ? 'var(--primary)' : 'var(--border)'}`, transition: 'border-color 0.3s' }}>
              {cameraOpen ? (
                <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
              ) : scanning ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
                    style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                  <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Validating…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center px-6">
                  <div className="relative w-28 h-28">
                    {[['top-0 left-0', 'border-t-2 border-l-2'], ['top-0 right-0', 'border-t-2 border-r-2'], ['bottom-0 left-0', 'border-b-2 border-l-2'], ['bottom-0 right-0', 'border-b-2 border-r-2']].map(([pos, border]) => (
                      <div key={pos} className={`absolute ${pos} w-6 h-6 ${border} rounded-sm`} style={{ borderColor: 'var(--primary)' }} />
                    ))}
                    <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--muted-foreground)' }}>
                      <CameraIcon size={36} />
                    </div>
                    <div className="absolute left-1 right-1 h-0.5" style={{ background: 'var(--primary)', opacity: 0.6, top: '50%', animation: 'scanline 2s ease-in-out infinite' }} />
                  </div>
                  <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Point camera at QR code</p>
                </div>
              )}
            </div>

            <style>{`@keyframes scanline { 0%, 100% { top: 10%; } 50% { top: 90%; } }`}</style>

            <button onClick={() => setCameraOpen(open => !open)} disabled={scanning} className="mb-5 w-full rounded-xl border py-3 text-sm font-bold" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>
              {cameraOpen ? 'Stop camera' : 'Start QR camera'}
            </button>
            {cameraError && <p className="mb-4 text-center text-xs" style={{ color: '#fca5a5' }}>{cameraError}</p>}

            <p className="text-center text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>Or enter ticket number manually</p>
            <div className="flex gap-2">
              <input type="text" placeholder="TKT-2026-XXXXXX"
                value={inputCode}
                onChange={e => setInputCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && inputCode && handleScan(inputCode)}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-mono outline-none"
                style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
              <button onClick={() => inputCode && handleScan(inputCode)} disabled={!inputCode || scanning}
                className="px-4 py-3 rounded-xl font-bold text-sm"
                style={{ background: inputCode ? 'var(--primary)' : 'var(--muted)', color: inputCode ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                Check
              </button>
            </div>

            <p className="text-xs text-center mt-4" style={{ color: 'var(--muted-foreground)' }}>Use the QR code printed on the customer&apos;s real ticket.</p>
          </div>
        )}

        {/* Valid */}
        {result === 'valid' && resultData && (
          <div className="w-full max-w-sm text-center">
            <div className="rounded-3xl overflow-hidden mb-4" style={{ border: '2px solid #22c55e', background: 'rgba(34,197,94,0.05)' }}>
              <div className="py-8 px-6">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '3px solid #22c55e' }}>
                  <CheckIcon size={30} style={{ color: '#22c55e' }} />
                </div>
                <h2 className="text-3xl font-bold mb-1" style={{ fontFamily: 'Outfit, sans-serif', color: '#22c55e' }}>Ticket Valid</h2>
                <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>Checked in successfully</p>
                <div className="rounded-2xl p-4 text-left" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Guest</span>
                    <span className="font-bold text-sm">{resultData.holder_name ?? 'Guest'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Ticket</span>
                    <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>{resultData.ticket_name ?? 'Ticket'}</span>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={reset} className="w-full py-4 rounded-2xl font-bold text-sm"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              Scan next
            </button>
          </div>
        )}

        {/* Used */}
        {result === 'used' && resultData && (
          <div className="w-full max-w-sm text-center">
            <div className="rounded-3xl overflow-hidden mb-4" style={{ border: '2px solid #ef4444', background: 'rgba(239,68,68,0.05)' }}>
              <div className="py-8 px-6">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '3px solid #ef4444' }}>
                  <div style={{ color: '#ef4444' }}><AlertIcon size={28} /></div>
                </div>
                <h2 className="text-3xl font-bold mb-1" style={{ fontFamily: 'Outfit, sans-serif', color: '#ef4444' }}>Already Used</h2>
                <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>Originally checked in: {resultData.checked_in_at ? new Date(resultData.checked_in_at).toLocaleString() : 'Previously'}</p>
                <div className="rounded-2xl p-4 text-left" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Name</span>
                    <span className="font-bold text-sm">{resultData.holder_name ?? 'Guest'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Ticket</span>
                    <span className="font-bold text-sm">{resultData.ticket_name ?? 'Ticket'}</span>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={reset} className="w-full py-4 rounded-2xl font-bold text-sm"
              style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
              Scan next
            </button>
          </div>
        )}

        {/* Invalid, declined, or unavailable */}
        {(result === 'invalid' || result === 'declined' || result === 'error') && (
          <div className="w-full max-w-sm text-center">
            <div className="rounded-3xl overflow-hidden mb-4" style={{ border: '2px solid #ef4444', background: 'rgba(239,68,68,0.05)' }}>
              <div className="py-8 px-6">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '3px solid #ef4444' }}>
                  <div style={{ color: '#ef4444' }}><XIcon size={30} /></div>
                </div>
                <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif', color: '#ef4444' }}>{result === 'declined' ? 'Check-in Declined' : result === 'error' ? 'Check-in unavailable' : 'Invalid Ticket'}</h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {result === 'declined' ? 'This event is cancelled, inactive, or has ended.' : result === 'error' ? scanError || 'The ticket service could not be reached. Try again.' : 'Code not found. Check the ticket or contact support.'}
                </p>
              </div>
            </div>
            <button onClick={reset} className="w-full py-4 rounded-2xl font-bold text-sm"
              style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
