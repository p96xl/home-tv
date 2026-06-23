import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Channel, Country, Filter } from './types'
import ChannelList from './components/ChannelList'
import Player from './components/Player'

const IPTV = 'https://iptv-org.github.io'

const DEFAULT_FILTERS: Filter[] = []

// languages.json shared fetch (~269KB, cached)
let _langsP: Promise<{ code: string; name: string }[]> | null = null
const fetchLangs = () => {
  if (!_langsP) _langsP = fetch(`${IPTV}/api/languages.json`).then(r => r.json())
  return _langsP
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [languages, setLanguages] = useState<{ code: string; name: string }[]>([])
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filter[]>([])
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const filteredChannelsRef = useRef<typeof filteredChannels>([])
  const selectedUrlRef = useRef<string | null>(null)
  const [pushState, setPushState] = useState<'idle' | 'pushing' | 'done' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/filters')
      .then(r => r.json())
      .then(setFilters)
      .catch(() => setFilters(DEFAULT_FILTERS))
  }, [])

  const pushSettings = useCallback(() => {
    setPushState('pushing')
    fetch('/api/filters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(filters) })
      .then(() => { setPushState('done'); setTimeout(() => setPushState('idle'), 1500) })
      .catch(() => { setPushState('error'); setTimeout(() => setPushState('idle'), 1500) })
  }, [filters])

  useEffect(() => {
    fetch(`${IPTV}/api/countries.json`).then(r => r.json()).then(setCountries).catch(console.error)
    fetchLangs().then(setLanguages).catch(console.error)
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch('/api/channels')
      .then(r => r.json())
      .then((data: Channel[]) => { setChannels(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const addFilter = useCallback((f: Omit<Filter, 'id'>) => {
    setFilters(prev => [...prev, { ...f, id: String(Date.now()) }])
  }, [])

  const removeFilter = useCallback((id: string) => {
    setFilters(prev => prev.filter(f => f.id !== id))
  }, [])

  const filteredChannels = useMemo(() => {
    let result = channels

    const includesByField = new Map<string, string[]>()
    for (const f of filters) {
      if (!f.negate) {
        const arr = includesByField.get(f.field) ?? []
        arr.push(f.value)
        includesByField.set(f.field, arr)
      }
    }
    for (const [field, values] of includesByField) {
      if (field === 'country') {
        const vset = new Set(values.map(v => v.toUpperCase()))
        result = result.filter(ch => ch.country != null && vset.has(ch.country))
      } else if (field === 'language') {
        const vset = new Set(values)
        result = result.filter(ch => {
          if (!ch.language) return false
          const langs = new Set(ch.language.split(';').map(l => l.trim()))
          return [...vset].some(v => langs.has(v))
        })
      } else if (field === 'category') {
        const vset = new Set(values)
        result = result.filter(ch => {
          if (!ch.category) return false
          const cats = new Set(ch.category.split(';').map(c => c.trim()))
          return [...vset].some(v => cats.has(v))
        })
      } else if (field === 'quality') {
        const vset = new Set(values)
        result = result.filter(ch => ch.quality != null && vset.has(ch.quality))
      }
    }

    for (const f of filters) {
      if (!f.negate) continue
      if (f.field === 'country') {
        result = result.filter(ch => ch.country !== f.value.toUpperCase())
      } else if (f.field === 'language') {
        result = result.filter(ch => {
          if (!ch.language) return true
          return !ch.language.split(';').map(l => l.trim()).includes(f.value)
        })
      } else if (f.field === 'category') {
        result = result.filter(ch => {
          if (!ch.category) return true
          return !ch.category.split(';').map(c => c.trim()).includes(f.value)
        })
      } else if (f.field === 'quality') {
        result = result.filter(ch => ch.quality !== f.value)
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(ch => ch.name.toLowerCase().includes(q))
    }
    return result
  }, [channels, search, filters])

  useEffect(() => {
    if (filteredChannels.length && !selectedUrl) setSelectedUrl(filteredChannels[0].url)
  }, [filteredChannels.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIdx = filteredChannels.findIndex(ch => ch.url === selectedUrl)
  const selectedChannel = channels.find(ch => ch.url === selectedUrl) ?? null

  const availableCategories = useMemo(() =>
    [...new Set(channels.flatMap(ch =>
      ch.category ? ch.category.split(';').map(c => c.trim()) : []
    ))].sort()
  , [channels])

  const availableQualities = useMemo(() =>
    [...new Set(channels.map(ch => ch.quality).filter(Boolean) as string[])].sort()
  , [channels])

  const markLive = useCallback((url: string, live: boolean) => {
    setChannels(prev => prev.map(c => c.url === url ? { ...c, is_live: live } : c))
  }, [])

  filteredChannelsRef.current = filteredChannels
  selectedUrlRef.current = selectedUrl

  const onStreamError = useCallback(() => {
    const list = filteredChannelsRef.current
    const cur = list.findIndex(ch => ch.url === selectedUrlRef.current)
    const next = list[cur + 1]
    if (next) setSelectedUrl(next.url)
  }, [])

  const lastTapRef = useRef(0)
  const onChannel = useCallback((dir: 'next' | 'prev') => {
    const now = Date.now()
    if (now - lastTapRef.current < 500) return  // ignore rapid taps so a double-tap doesn't skip 2 channels
    lastTapRef.current = now
    const list = filteredChannelsRef.current
    const cur = list.findIndex(ch => ch.url === selectedUrlRef.current)
    const target = dir === 'next' ? list[cur + 1] : list[cur - 1]
    if (target) setSelectedUrl(target.url)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const list = filteredChannelsRef.current
      if (!list.length) return
      const cur = list.findIndex(ch => ch.url === selectedUrlRef.current)
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        const next = list[Math.min(cur + 1, list.length - 1)]
        if (next) setSelectedUrl(next.url)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const next = list[Math.max(cur - 1, 0)]
        if (next) setSelectedUrl(next.url)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden select-none">
      <header className={`flex items-center px-5 h-12 border-b border-white/5 bg-black/30 flex-shrink-0 gap-3 overflow-hidden transition-all duration-300 ${sidebarOpen ? '' : '-mt-12 opacity-0'}`}>
        <span className="font-bold tracking-tight">📺 Home TV</span>
        <button
          onClick={pushSettings}
          className="ml-auto text-[10px] font-mono text-white/25 hover:text-white/60 border border-white/10 hover:border-white/20 rounded px-2 py-1 transition-colors"
          title="Save this session's filters as the household default for new sessions"
        >
          {pushState === 'pushing' ? '⏳ Pushing…' : pushState === 'done' ? '✅ Pushed' : pushState === 'error' ? '⚠️ Failed' : '⬆️ Push Settings to Server'}
        </button>
        <button
          onClick={() => {
            const url = `${window.location.protocol}//${window.location.hostname}:8000/playlist.m3u`
            navigator.clipboard.writeText(url).catch(() => {})
          }}
          className="text-[10px] font-mono text-white/25 hover:text-white/60 border border-white/10 hover:border-white/20 rounded px-2 py-1 transition-colors"
          title="Copy TiviMate playlist URL (raw stream URLs, for native apps)"
        >
          📋 TiviMate URL
        </button>
        <button
          onClick={() => {
            const url = `${window.location.protocol}//${window.location.hostname}:8000/playlist.m3u?proxy=true`
            navigator.clipboard.writeText(url).catch(() => {})
          }}
          className="text-[10px] font-mono text-white/25 hover:text-white/60 border border-white/10 hover:border-white/20 rounded px-2 py-1 transition-colors"
          title="Copy proxied playlist URL (streams routed through this server — use for browser-based players)"
        >
          📋 Browser URL
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <ChannelList
            channels={filteredChannels}
            selectedIdx={selectedIdx}
            loading={loading}
            search={search}
            onSearch={setSearch}
            onSelect={idx => setSelectedUrl(filteredChannels[idx]?.url ?? null)}
            filters={filters}
            availableCategories={availableCategories}
            availableQualities={availableQualities}
            onAddFilter={addFilter}
            onRemoveFilter={removeFilter}
            countries={countries}
            languages={languages}
          />
        )}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="flex items-center justify-center w-5 flex-shrink-0 bg-zinc-900 hover:bg-zinc-800 text-white/20 hover:text-white/70 transition-colors border-x border-white/5 cursor-pointer text-xs"
          title={sidebarOpen ? 'Hide menu' : 'Show menu'}
        >
          {sidebarOpen ? '‹' : '›'}
        </button>
        <Player channel={selectedChannel} onLive={markLive} onError={onStreamError} onChannel={onChannel} sidebarOpen={sidebarOpen} />
      </div>
    </div>
  )
}
