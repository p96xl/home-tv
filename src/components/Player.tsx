import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import type { Channel } from '../types'

interface Props {
  channel: Channel | null
  channelIdx: number
  onLive: (idx: number, live: boolean) => void
}

type State = 'idle' | 'loading' | 'playing' | 'error'

export default function Player({ channel, channelIdx, onLive }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [state, setState] = useState<State>('idle')

  useEffect(() => {
    const video = videoRef.current
    if (!video || !channel) { setState('idle'); return }

    hlsRef.current?.destroy()
    setState('loading')

    const fail = () => { setState('error'); onLive(channelIdx, false) }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false })
      hlsRef.current = hls
      hls.loadSource(channel.url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
        setState('playing')
        onLive(channelIdx, true)
      })
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail() })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = channel.url
      video.oncanplay = () => { setState('playing'); onLive(channelIdx, true) }
      video.onerror = fail
      video.play().catch(() => {})
    } else {
      fail()
    }

    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [channel?.url, channelIdx, onLive])

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

      {state !== 'idle' && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10 pointer-events-none">
          <div className="flex items-end gap-3">
            {channel.logo && (
              <img src={channel.logo} alt="" className="w-9 h-9 object-contain flex-shrink-0" />
            )}
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono text-white/30">CH {String(channel.number).padStart(3, '00')}</span>
                {state === 'playing' && <span className="text-[10px] text-green-400 font-mono">● LIVE</span>}
              </div>
              <p className="text-white font-semibold text-lg leading-tight">{channel.name}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
