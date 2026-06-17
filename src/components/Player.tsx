import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import type { Channel } from '../types'

interface Props {
  channel: Channel | null
  onLive: (url: string, live: boolean) => void
  sidebarOpen: boolean
}

type State = 'idle' | 'loading' | 'playing' | 'error'

export default function Player({ channel, onLive, sidebarOpen }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [state, setState] = useState<State>('idle')
  const [osdKey, setOsdKey] = useState<number | null>(null)
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!channel || sidebarOpen) return
    setOsdKey(Date.now())
    if (osdTimer.current) clearTimeout(osdTimer.current)
    osdTimer.current = setTimeout(() => setOsdKey(null), 3100)
    return () => { if (osdTimer.current) clearTimeout(osdTimer.current) }
  }, [sidebarOpen, channel?.name])

  const toggleFullscreen = () => {
    const el = videoRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else if (el.requestFullscreen) {
      el.requestFullscreen()
    } else if ((el as any).webkitEnterFullscreen) {
      (el as any).webkitEnterFullscreen()
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video || !channel) { setState('idle'); return }

    hlsRef.current?.destroy()
    setState('loading')

    const fail = () => { setState('error'); onLive(channel.url, false) }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false })
      hlsRef.current = hls
      hls.loadSource(channel.url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
        setState('playing')
        onLive(channel.url, true)
      })
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail() })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = channel.url
      video.oncanplay = () => { setState('playing'); onLive(channel.url, true) }
      video.onerror = fail
      video.play().catch(() => {})
    } else {
      fail()
    }

    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [channel?.url, onLive])

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center opacity-20">
          <div className="text-6xl mb-3">📺</div>
          <p className="text-sm">Select a channel · ↑ ↓ to surf</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 relative bg-black overflow-hidden">
      <video ref={videoRef} className="w-full h-full object-contain" playsInline />

      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="text-white/40 text-sm">Stream unavailable</p>
        </div>
      )}

      {osdKey !== null && channel && (
        <div
          key={osdKey}
          className="absolute top-6 inset-x-0 flex justify-center pointer-events-none"
          style={{ animation: 'osd-fade 3s forwards' }}
        >
          <div
            className="bg-black/70 text-amber-100 font-mono px-5 py-2 rounded-sm text-center"
            style={{ textShadow: '0 0 14px rgba(251,191,36,0.6)' }}
          >
            <div className="text-[10px] opacity-40 tracking-[0.3em] uppercase">CH {String(channel.number).padStart(3, '0')}</div>
            <div className="text-base font-bold tracking-wider">{channel.name}</div>
          </div>
        </div>
      )}

      {state !== 'idle' && sidebarOpen && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10 pointer-events-none">
          <div className="flex items-end gap-3">
            {channel.logo && (
              <img src={channel.logo} alt="" className="w-9 h-9 object-contain flex-shrink-0" />
            )}
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono text-white/30">CH {String(channel.number).padStart(3, '0')}</span>
                {state === 'playing' && <span className="text-[10px] text-green-400 font-mono">● LIVE</span>}
                {channel.language && <span className="text-[10px] text-white/20 font-mono">{channel.language}</span>}
              </div>
              <p className="text-white font-semibold text-lg leading-tight">{channel.name}</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={toggleFullscreen}
        className="absolute bottom-4 right-4 p-1.5 rounded bg-black/40 hover:bg-black/70 text-white/30 hover:text-white/80 transition-colors pointer-events-auto"
        title="Fullscreen"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M0 0h4v1H1v3H0V0zm10 0h4v4h-1V1h-3V0zM0 10h1v3h3v1H0v-4zm13 0v4h-4v-1h3v-3h1z"/>
        </svg>
      </button>
    </div>
  )
}
