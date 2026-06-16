import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Channel, Country, Settings, Filter, FilterField } from './types'
import ChannelList from './components/ChannelList'
import Player from './components/Player'

const IPTV = 'https://iptv-org.github.io'
const DEFAULT: Settings = { country: 'UA', blacklisted_languages: [] }
const STORAGE_KEY = 'home-tv-settings'

function loadSettings(): Settings {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } }
  catch { return DEFAULT }
}

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
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filter[]>([])
  const [loading, setLoading] = useState(false)

  const loadChannels = useCallback(async (code: string) => {
    if (!code) { setChannels([]); return }
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

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      if (patch.country) next.country = patch.country.toUpperCase()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
    if (patch.country) loadChannels(patch.country.toUpperCase())
    // Sync to backend so /playlist.m3u stays current for the Chromecast
    fetch('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {})
  }, [loadChannels])

  // Load countries once
  useEffect(() => {
    fetch(`${IPTV}/api/countries.json`).then(r => r.json()).then(setCountries).catch(console.error)
  }, [])

  useEffect(() => { const c = loadSettings().country; if (c) loadChannels(c) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Language-blacklisted view
  const visibleChannels = useMemo(() => {
    if (!settings.blacklisted_languages.length) return channels
    return channels.filter(ch => {
      if (!ch.language) return true
      return !ch.language.split(';').map(l => l.trim()).some(l => settings.blacklisted_languages.includes(l))
    })
  }, [channels, settings.blacklisted_languages])

  // Text search + structured pill filters
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
        else if (f.field === 'live')
          hit = f.value === 'true' ? ch.is_live !== false : ch.is_live === false
        else hit = true
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
    if (f.field === 'country') {
      updateSettings({ country: f.value })
    } else if (f.field === 'language' && f.negate) {
      updateSettings({ blacklisted_languages: [...settings.blacklisted_languages, f.value] })
    } else {
      setFilters(prev => [...prev, { ...f, id: String(Date.now()) }])
    }
  }, [settings.blacklisted_languages, updateSettings])

  const removeFilter = useCallback((id: string) => {
    if (id === 'country') { updateSettings({ country: '' }); setChannels([]); return }
    if (id.startsWith('bl-')) {
      const lang = id.slice(3)
      updateSettings({ blacklisted_languages: settings.blacklisted_languages.filter(l => l !== lang) })
    } else {
      setFilters(prev => prev.filter(f => f.id !== id))
    }
  }, [settings.blacklisted_languages, updateSettings])

  const allPills = useMemo<Filter[]>(() => [
    ...(settings.country ? [{ id: 'country', field: 'country' as FilterField, value: settings.country, negate: false }] : []),
    ...settings.blacklisted_languages.map(lang => ({
      id: `bl-${lang}`, field: 'language' as FilterField, value: lang, negate: true,
    })),
    ...filters,
  ], [settings.country, settings.blacklisted_languages, filters])

  const markLive = useCallback((url: string, live: boolean) => {
    setChannels(prev => prev.map(c => c.url === url ? { ...c, is_live: live } : c))
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!filteredChannels.length) return
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
  }, [filteredChannels.length])

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden select-none">
      <header className="flex items-center px-5 h-12 border-b border-white/5 bg-black/30 flex-shrink-0">
        <span className="font-bold tracking-tight">📺 Home TV</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ChannelList
          channels={filteredChannels}
          selectedIdx={selectedIdx}
          loading={loading}
          search={search}
          onSearch={setSearch}
          onSelect={setSelectedIdx}
          filters={allPills}
          availableLanguages={availableLanguages}
          availableCategories={availableCategories}
          onAddFilter={addFilter}
          onRemoveFilter={removeFilter}
          countries={countries}
        />
        <Player channel={filteredChannels[selectedIdx] ?? null} onLive={markLive} />
      </div>
    </div>
  )
}
