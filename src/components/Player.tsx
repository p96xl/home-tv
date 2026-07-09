import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import type { Channel } from '../types'

interface Props {
  channel: Channel | null
  onLive: (url: string, live: boolean) => void
  onError: () => void
  onChannel: (dir: 'next' | 'prev') => void
  sidebarOpen: boolean
  debug: boolean
  onOmit: (url: string) => void
}

type State = 'idle' | 'loading' | 'playing' | 'error'

export default function Player({ channel, onLive, onError, onChannel, sidebarOpen, debug, onOmit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [state, setState] = useState<State>('idle')
  const [bannerKey, setBannerKey] = useState<number | null>(null)
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ccTracks, setCcTracks] = useState<{id: number, name: string}[]>([])
  const [ccOn, setCcOn] = useState(false)
  const [curUrl, setCurUrl] = useState<string | null>(null)  // which link is on screen (debug)
  const curUrlRef = useRef<string | null>(null)
  const advanceRef = useRef<(() => void) | null>(null)       // jump to the next link on omit
  const playRef = useRef<((idx: number) => void) | null>(null)  // play a specific link (debug)
  const manualRef = useRef(false)                            // user picked a link — don't auto-skip

  // Flash bottom banner on channel change when in full-page mode
  useEffect(() => {
    if (!channel || sidebarOpen) return
    setBannerKey(Date.now())
    if (bannerTimer.current) clearTimeout(bannerTimer.current)
    bannerTimer.current = setTimeout(() => setBannerKey(null), 4100)
    return () => { if (bannerTimer.current) clearTimeout(bannerTimer.current) }
  }, [sidebarOpen, channel?.name])

  const toggleCC = () => {
    const next = !ccOn
    setCcOn(next)
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = next ? 0 : -1
    } else {
      const video = videoRef.current
      if (!video) return
      Array.from(video.textTracks).forEach(t => {
        if (t.kind === 'subtitles' || t.kind === 'captions') t.mode = next ? 'showing' : 'hidden'
      })
    }
  }

  const omitCurrent = () => {
    const bad = curUrlRef.current
    if (!bad) return
    advanceRef.current?.()   // move to the next link immediately
    onOmit(bad)              // persist the omission + drop it from the list
  }

  const playManual = (idx: number) => {
    manualRef.current = true   // manual pick: on error, stop and show it (don't auto-skip)
    playRef.current?.(idx)
  }

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
    setCcTracks([])
    setCcOn(false)
    manualRef.current = false

    const urls = [channel.url, ...channel.alt_urls]

    const tryUrl = (idx: number) => {
      hlsRef.current?.destroy()
      curUrlRef.current = urls[idx]
      setCurUrl(urls[idx])
      setState('loading')
      advanceRef.current = () => (idx + 1 < urls.length ? tryUrl(idx + 1) : (setState('error'), onError()))
      const proxied = `/proxy?url=${encodeURIComponent(urls[idx])}`

      const fail = () => {
        // Auto-skip to the next link only during normal playback; on a manual pick, stop on the
        // error so the user can see this specific link is dead.
        if (!manualRef.current && idx + 1 < urls.length) {
          tryUrl(idx + 1)
        } else {
          setState('error')
          onLive(channel.url, false)
          if (!manualRef.current) onError()  // manual pick failing must not jump to the next channel
        }
      }

      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: false })
        hlsRef.current = hls
        hls.loadSource(proxied)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
          setState('playing')
          onLive(channel.url, true)
        })
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
          setCcTracks(data.subtitleTracks.map((t: any) => ({ id: t.id, name: t.name || t.lang || `CC ${t.id + 1}` })))
        })
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail() })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = proxied
        video.oncanplay = () => {
          setState('playing')
          onLive(channel.url, true)
          const tracks = Array.from(video.textTracks).filter(t => t.kind === 'subtitles' || t.kind === 'captions')
          if (tracks.length) setCcTracks(tracks.map((t, i) => ({ id: i, name: t.label || t.language || `CC ${i + 1}` })))
        }
        video.onerror = fail
        video.play().catch(() => {})
      } else {
        fail()
      }
    }

    playRef.current = tryUrl
    tryUrl(0)

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

  const showBanner = state !== 'idle' && (sidebarOpen || bannerKey !== null)

  return (
    <div className="flex-1 relative bg-black overflow-hidden">
      <video ref={videoRef} className="w-full h-full object-contain" playsInline />

      {/* Tap zones for channel up/down — always available in big picture mode, even while buffering */}
      {!sidebarOpen && (
        <>
          <div
            onClick={() => onChannel('prev')}
            className="absolute top-0 left-0 right-0 h-1/2 cursor-pointer active:bg-white/5 select-none flex items-end justify-center pb-1"
          >
            {bannerKey !== null && <span className="text-white/10 text-2xl leading-none">▲</span>}
          </div>
          <div
            onClick={() => onChannel('next')}
            className="absolute bottom-0 left-0 right-0 h-1/2 cursor-pointer active:bg-white/5 select-none flex items-start justify-center pt-1"
          >
            {bannerKey !== null && <span className="text-white/10 text-2xl leading-none">▼</span>}
          </div>
        </>
      )}

      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 pointer-events-none">
          <p className="text-white/40 text-sm">Stream unavailable</p>
        </div>
      )}

      {debug && curUrl && (() => {
        const urls = [channel.url, ...channel.alt_urls]
        const idx = urls.indexOf(curUrl)
        return (
          <div className="absolute top-3 left-3 max-w-[min(90%,42rem)] bg-black/80 rounded p-2.5 text-[11px] font-mono pointer-events-auto z-10">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-amber-400">🐞 {urls.length} link{urls.length > 1 ? 's' : ''} — click to test</span>
              <button
                onClick={omitCurrent}
                className="ml-auto px-1.5 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white text-[10px]"
                title="Omit the current link and drop it from this channel"
              >
                ⊘ Omit link {idx + 1}
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {urls.map((_, i) => {
                const cur = i === idx
                const color = cur
                  ? state === 'playing' ? 'bg-green-600 text-white'
                    : state === 'error' ? 'bg-red-600 text-white'
                    : 'bg-amber-500 text-black'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
                return (
                  <button key={i} onClick={() => playManual(i)}
                    className={`w-6 h-6 rounded ${color} ${cur ? 'ring-2 ring-white/70' : ''}`}
                    title={urls[i]}>
                    {i + 1}
                  </button>
                )
              })}
            </div>
            <div className="text-white/60 break-all leading-snug">
              {state === 'playing' ? '● ' : state === 'error' ? '✕ ' : '… '}{curUrl}
            </div>
          </div>
        )
      })()}

      {showBanner && (
        <div
          key={!sidebarOpen ? bannerKey ?? undefined : undefined}
          style={!sidebarOpen ? { animation: 'banner-flash 4s forwards' } : undefined}
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10 pointer-events-none"
        >
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

      {ccTracks.length > 0 && (
        <button
          onClick={toggleCC}
          className={`absolute bottom-4 right-12 px-1.5 py-1 rounded text-[11px] font-mono font-bold transition-colors pointer-events-auto ${
            ccOn ? 'bg-white/20 text-white' : 'bg-black/40 text-white/30 hover:text-white/70'
          }`}
          title={ccOn ? 'Hide captions' : 'Show captions'}
        >
          CC
        </button>
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
