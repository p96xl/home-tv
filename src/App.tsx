import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Channel, Country, Settings, Filter } from './types'
import ChannelList from './components/ChannelList'
import Player from './components/Player'
import SettingsPanel from './components/Settings'

const IPTV = 'https://iptv-org.github.io'
const DEFAULT: Settings = { country: 'UA', blacklisted_languages: [] }

function parseM3U(text: string): Channel[] {
  const lines = text.split('\n')
  const channels: Channel[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXTINF')) continue
    const url = lines[i + 1]?.trim()
    if (!url?.startsWith('http')) continue
    const name = line.replace(/.*,/, '').trim()
    const logo = line.match(/tvg-logo="([^"]+)"/)?.[1] || null
    const id = line.match(/tvg-id="([^"]+)"/)?.[1] ?? name
    const language = line.match(/tvg-language="([^"]+)"/)?.[1] || null
    const category = line.match(/group-title="([^"]+)"/)?.[1] || null
    channels.push({ id, name, logo, url, number: channels.length + 1, language, category, is_live: null })
  }
  return channels
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filter[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(false)
  const prevCountry = useRef(DEFAULT.country)

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

  // Load countries once
  useEffect(() => {
    fetch(`${IPTV}/api/countries.json`).then(r => r.json()).then(setCountries).catch(console.error)
  }, [])

  // Initial channel load
  useEffect(() => { loadChannels(DEFAULT.country) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load settings from server, then poll every 5s so Chromecast stays in sync with phone
  useEffect(() => {
    const sync = async () => {
      try {
        const data: Settings = await fetch('/settings').then(r => r.json())
        setSettings(data)
        if (data.country.toUpperCase() !== prevCountry.current.toUpperCase()) {
          prevCountry.current = data.country.toUpperCase()
          loadChannels(data.country)
        }
      } catch { /* backend optional */ }
    }
    sync()
    const id = setInterval(sync, 5000)
    return () => clearInterval(id)
  }, [loadChannels])

  // Stream validation polling
  useEffect(() => {
    if (!channels.length) return
    let stopped = false
    const poll = async () => {
      try {
        const data = await fetch(`/validate?country=${settings.country}`).then(r => r.json())
        const results: Record<string, boolean | null> = data.results ?? {}
        setChannels(prev => prev.map(ch => {
          const live = results[ch.url]
          return live !== undefined && live !== ch.is_live ? { ...ch, is_live: live } : ch
        }))
        if (!data.running) return
      } catch { /* backend optional */ }
      if (!stopped) setTimeout(poll, 4000)
    }
    poll()
    return () => { stopped = true }
  }, [channels.length, settings.country])

  // Language-blacklisted view
  const visibleChannels = useMemo(() => {
    if (!settings.blacklisted_languages.length) return channels
    return channels.filter(ch => {
      if (!ch.language) return true
      return !ch.language.split(';').map(l => l.trim()).some(l => settings.blacklisted_languages.includes(l))
    })
  }, [channels, settings.blacklisted_languages])

  // Text search (name only) + structured pill filters
  const filteredChannels = useMemo(() => {
    let result = visibleChannels
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(ch => ch.name.toLowerCase().includes(q))
    }
    for (const f of filters) {
      result = result.filter(ch => {
        let hit: boolean
        if (f.field === 'language')
          hit = (ch.language ?? '').split(';').map(l => l.trim()).includes(f.value)
        else if (f.field === 'category')
          hit = ch.category === f.value
        else
          hit = f.value === 'true' ? ch.is_live === true : ch.is_live !== true
        return f.negate ? !hit : hit
      })
    }
    return result
  }, [visibleChannels, search, filters])

  // Clamp selection when list shrinks
  useEffect(() => {
    if (filteredChannels.length && selectedIdx >= filteredChannels.length)
      setSelectedIdx(filteredChannels.length - 1)
  }, [filteredChannels.length, selectedIdx])

  // Reset selection when search or filters change
  useEffect(() => { setSelectedIdx(0) }, [search, filters])

  const availableLanguages = useMemo(() =>
    [...new Set(channels.flatMap(ch => ch.language ? ch.language.split(';').map(l => l.trim()) : []))].sort()
  , [channels])

  const availableCategories = useMemo(() =>
    [...new Set(channels.flatMap(ch => ch.category ? [ch.category] : []))].sort()
  , [channels])

  const addFilter = useCallback((f: Omit<Filter, 'id'>) => {
    setFilters(prev => [...prev, { ...f, id: String(Date.now()) }])
  }, [])

  const removeFilter = useCallback((id: string) => {
    setFilters(prev => prev.filter(f => f.id !== id))
  }, [])

  // markLive uses url to avoid stale-closure issues with indices
  const markLive = useCallback((url: string, live: boolean) => {
    setChannels(prev => prev.map(c => c.url === url ? { ...c, is_live: live } : c))
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showSettings || !filteredChannels.length) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(i + 1, filteredChannels.length - 1))
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filteredChannels.length, showSettings])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      if (patch.country) next.country = patch.country.toUpperCase()
      return next
    })

    if (patch.country) {
      const code = patch.country.toUpperCase()
      prevCountry.current = code
      loadChannels(code)
      setShowSettings(false)
    }

    try {
      const saved: Settings = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).then(r => r.json())
      setSettings(saved)
    } catch { /* backend optional, optimistic update already applied */ }
  }, [loadChannels])

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden select-none">
      <header className="flex items-center justify-between px-5 h-12 border-b border-white/5 bg-black/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-tight">📺 Home TV</span>
          <span className="text-[10px] font-mono text-white/30 border border-white/10 rounded px-1.5 py-0.5 uppercase tracking-widest">
            {settings.country}
          </span>
          {settings.blacklisted_languages.length > 0 && (
            <span className="text-[10px] text-orange-400/60">
              {visibleChannels.length}/{channels.length} channels
            </span>
          )}
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
          channels={filteredChannels}
          selectedIdx={selectedIdx}
          loading={loading}
          search={search}
          onSearch={setSearch}
          onSelect={setSelectedIdx}
          filters={filters}
          availableLanguages={availableLanguages}
          availableCategories={availableCategories}
          onAddFilter={addFilter}
          onRemoveFilter={removeFilter}
        />
        <Player channel={filteredChannels[selectedIdx] ?? null} onLive={markLive} />
      </div>

      {showSettings && (
        <SettingsPanel
          countries={countries}
          settings={settings}
          availableLanguages={availableLanguages}
          onUpdate={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
