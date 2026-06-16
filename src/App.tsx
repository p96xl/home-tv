import { useState, useEffect, useCallback } from 'react'
import type { Channel, Country } from './types'
import ChannelList from './components/ChannelList'
import Player from './components/Player'
import Settings from './components/Settings'

const IPTV = 'https://iptv-org.github.io'

function parseM3U(text: string): Channel[] {
  const lines = text.split('\n')
  const channels: Channel[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXTINF')) continue
    const url = lines[i + 1]?.trim()
    if (!url?.startsWith('http')) continue
    const name = line.replace(/.*,/, '').trim()
    const logoMatch = line.match(/tvg-logo="([^"]+)"/)
    const logo = logoMatch?.[1] || null
    const id = line.match(/tvg-id="([^"]+)"/)?.[1] ?? name
    channels.push({ id, name, logo, url, number: channels.length + 1, is_live: null })
  }
  return channels
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [country, setCountry] = useState(() => localStorage.getItem('home-tv-country') ?? 'UA')
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadChannels = useCallback(async (code: string) => {
    setLoading(true)
    setChannels([])
    setSelectedIdx(0)
    try {
      const text = await fetch(`${IPTV}/iptv/countries/${code.toLowerCase()}.m3u`).then(r => r.text())
      setChannels(parseM3U(text))
    } catch {
      setChannels([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch(`${IPTV}/api/countries.json`).then(r => r.json()).then(setCountries).catch(console.error)
  }, [])

  useEffect(() => {
    loadChannels(country)
    localStorage.setItem('home-tv-country', country)
  }, [country, loadChannels])

  const markLive = useCallback((idx: number, live: boolean) => {
    setChannels(prev => {
      if (!prev[idx]) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], is_live: live }
      return next
    })
  }, [])

  // Poll backend validator and update channel statuses
  useEffect(() => {
    if (!channels.length) return
    let stopped = false

    const poll = async () => {
      try {
        const data = await fetch(`/validate?country=${country}`).then(r => r.json())
        const results: Record<string, boolean | null> = data.results ?? {}
        setChannels(prev => prev.map(ch => {
          const live = results[ch.url]
          return live !== undefined && live !== ch.is_live ? { ...ch, is_live: live } : ch
        }))
        if (!data.running && !stopped) return  // done, stop polling
      } catch { /* server not running — dots update on playback instead */ }
      if (!stopped) setTimeout(poll, 4000)
    }

    poll()
    return () => { stopped = true }
  }, [channels.length, country])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showSettings || !channels.length) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(i + 1, channels.length - 1))
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [channels.length, showSettings])

  const handleCountryChange = (code: string) => {
    setCountry(code)
    setShowSettings(false)
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden select-none">
      <header className="flex items-center justify-between px-5 h-12 border-b border-white/5 bg-black/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-tight">📺 Home TV</span>
          <span className="text-[10px] font-mono text-white/30 border border-white/10 rounded px-1.5 py-0.5 uppercase tracking-widest">
            {country}
          </span>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          title="Settings"
        >
          ⚙
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ChannelList
          channels={channels}
          selectedIdx={selectedIdx}
          loading={loading}
          onSelect={setSelectedIdx}
        />
        <Player channel={channels[selectedIdx] ?? null} channelIdx={selectedIdx} onLive={markLive} />
      </div>

      {showSettings && (
        <Settings
          countries={countries}
          currentCountry={country}
          onCountryChange={handleCountryChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
