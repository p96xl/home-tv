import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Channel, Country, Filter } from './types'
import ChannelList from './components/ChannelList'
import Player from './components/Player'

const IPTV = 'https://iptv-org.github.io'
const FILTER_KEY = 'home-tv-filters'

function loadFilters(): Filter[] {
  try { return JSON.parse(localStorage.getItem(FILTER_KEY) ?? '[]') }
  catch { return [] }
}

function parseM3U(text: string, fallbackCountry: string | null = null): Channel[] {
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
    const country = line.match(/tvg-country="([^"]+)"/)?.[1] || fallbackCountry
    channels.push({ id, name, logo, url, number: 0, language, category, country, is_live: null })
  }
  channels.forEach((ch, i) => { ch.number = i + 1 })
  return channels
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filter[]>(loadFilters)
  const [loading, setLoading] = useState(false)

  // Persist filters
  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify(filters))
  }, [filters])

  // Country includes (sorted join) drives which M3Us to load
  const countryKey = filters
    .filter(f => f.field === 'country' && !f.negate)
    .map(f => f.value)
    .sort()
    .join(',')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setChannels([])
    setSelectedIdx(0)
    const codes = countryKey ? countryKey.split(',') : []
    const urls = codes.length
      ? codes.map(c => `${IPTV}/iptv/countries/${c.toLowerCase()}.m3u`)
      : [`${IPTV}/iptv/index.m3u`]

    Promise.all(
      urls.map((url, i) => fetch(url).then(r => r.text()).then(t => parseM3U(t, codes[i] ?? null)))
    ).then(results => {
      if (cancelled) return
      const merged = results.flat()
      merged.forEach((ch, i) => { ch.number = i + 1 })
      setChannels(merged)
    }).catch(() => { if (!cancelled) setChannels([]) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [countryKey])

  useEffect(() => {
    fetch(`${IPTV}/api/countries.json`).then(r => r.json()).then(setCountries).catch(console.error)
  }, [])

  const filteredChannels = useMemo(() => {
    let result = search.trim()
      ? channels.filter(ch => ch.name.toLowerCase().includes(search.toLowerCase()))
      : channels

    // Group by field: country includes are handled via loading, only process excludes
    const byField: Record<string, { inc: string[], exc: string[] }> = {}
    for (const f of filters) {
      if (!byField[f.field]) byField[f.field] = { inc: [], exc: [] }
      if (f.negate) byField[f.field].exc.push(f.value)
      else if (f.field !== 'country') byField[f.field].inc.push(f.value)
    }

    for (const [field, { inc, exc }] of Object.entries(byField)) {
      if (field === 'country') {
        if (exc.length) result = result.filter(ch => !exc.includes(ch.country ?? ''))
        continue
      }
      if (field === 'live') {
        if (inc.includes('true')) result = result.filter(ch => ch.is_live !== false)
        else if (inc.includes('false')) result = result.filter(ch => ch.is_live === false)
        continue
      }
      const vals = (ch: Channel): string[] => {
        if (field === 'language') return (ch.language ?? '').split(';').map(l => l.trim()).filter(Boolean)
        if (field === 'category') return ch.category ? [ch.category] : []
        return []
      }
      if (inc.length) result = result.filter(ch => inc.some(v => vals(ch).includes(v)))
      if (exc.length) result = result.filter(ch => !exc.some(v => vals(ch).includes(v)))
    }

    return result
  }, [channels, filters, search])

  useEffect(() => {
    if (filteredChannels.length && selectedIdx >= filteredChannels.length)
      setSelectedIdx(filteredChannels.length - 1)
  }, [filteredChannels.length, selectedIdx])

  useEffect(() => { setSelectedIdx(0) }, [search, filters])

  const availableLanguages = useMemo(() =>
    [...new Set(channels.flatMap(ch => ch.language
      ? ch.language.split(';').map(l => l.trim()).filter(Boolean)
      : []))].sort()
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

  const markLive = useCallback((url: string, live: boolean) => {
    setChannels(prev => prev.map(c => c.url === url ? { ...c, is_live: live } : c))
  }, [])

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
          filters={filters}
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
