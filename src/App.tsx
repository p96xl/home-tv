import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Channel, Country, Filter } from './types'
import ChannelList from './components/ChannelList'
import Player from './components/Player'

const IPTV = 'https://iptv-org.github.io'

// languages.json shared fetch (~269KB, cached)
let _langsP: Promise<{ code: string; name: string }[]> | null = null
const fetchLangs = () => {
  if (!_langsP) _langsP = fetch(`${IPTV}/api/languages.json`).then(r => r.json())
  return _langsP
}

// feeds.json channel→language enrichment (~7MB, cached, lazy)
let _langMetaP: Promise<Map<string, string>> | null = null
function getLangMeta(): Promise<Map<string, string>> {
  if (!_langMetaP) {
    _langMetaP = Promise.all([
      fetch(`${IPTV}/api/feeds.json`).then(r => r.json()),
      fetchLangs(),
    ]).then(([feeds, langs]: [any[], { code: string; name: string }[]]) => {
      const langName = new Map(langs.map(l => [l.code, l.name]))
      const map = new Map<string, string>()
      for (const f of feeds) {
        if (!f.languages?.length) continue
        const names = f.languages.map((c: string) => langName.get(c) ?? c).join(';')
        map.set(`${f.channel}@${f.id}`, names)
        if (!map.has(f.channel)) map.set(f.channel, names)
      }
      return map
    })
  }
  return _langMetaP
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
    // Extract country from tvg-id pattern "ChannelName.cc@feedId" or "ChannelName.cc"
    const suffix = id.split('@')[0].split('.').pop() ?? ''
    const country = suffix.length === 2 ? suffix.toUpperCase() : null
    channels.push({ id, name, logo, url, number: channels.length + 1, language, category, country, is_live: null })
  }
  return channels
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
  const loadIdRef = useRef(0)
  const lastIncludeKeyRef = useRef('')

  // Load reference data once
  useEffect(() => {
    fetch(`${IPTV}/api/countries.json`).then(r => r.json()).then(setCountries).catch(console.error)
    fetchLangs().then(setLanguages).catch(console.error)
  }, [])

  // Reload channels whenever include filters (country/language) change
  useEffect(() => {
    const includes = filters.filter(f => !f.negate && (f.field === 'country' || f.field === 'language'))
    const key = includes.map(f => `${f.field}:${f.value}`).sort().join('|')
    if (key === lastIncludeKeyRef.current) return
    lastIncludeKeyRef.current = key

    if (!key) { setChannels([]); return }

    const loadId = ++loadIdRef.current
    setLoading(true)
    setChannels([])
    setSelectedUrl(null)

    ;(async () => {
      try {
        const langCodes = await fetchLangs().then(langs => new Map(langs.map(l => [l.name, l.code])))
        const urls = includes.map(f => {
          if (f.field === 'country') return `${IPTV}/iptv/countries/${f.value.toLowerCase()}.m3u`
          const code = langCodes.get(f.value) ?? f.value.toLowerCase()
          return `${IPTV}/iptv/languages/${code}.m3u`
        })
        const texts = await Promise.all(urls.map(url => fetch(url).then(r => r.text()).catch(() => '')))
        if (loadIdRef.current !== loadId) return

        // Merge M3Us, deduplicate by stream URL
        const seen = new Set<string>()
        const merged: Channel[] = []
        for (const text of texts) {
          for (const ch of parseM3U(text)) {
            if (!seen.has(ch.url)) {
              seen.add(ch.url)
              merged.push({ ...ch, number: merged.length + 1 })
            }
          }
        }
        setChannels(merged)
        setLoading(false)

        // Background language enrichment via feeds.json
        if (merged.length) {
          getLangMeta().then(langMap => {
            if (loadIdRef.current !== loadId) return
            setChannels(prev => prev.map(ch => ({
              ...ch,
              language: ch.language ?? langMap.get(ch.id) ?? langMap.get(ch.id.replace(/@.*$/, '')) ?? null,
            })))
          }).catch(() => {})
        }
      } catch {
        if (loadIdRef.current !== loadId) return
        setChannels([])
        setLoading(false)
      }
    })()
  }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const addFilter = useCallback((f: Omit<Filter, 'id'>) => {
    setFilters(prev => [...prev, { ...f, id: String(Date.now()) }])
  }, [])

  const removeFilter = useCallback((id: string) => {
    setFilters(prev => prev.filter(f => f.id !== id))
  }, [])

  // Apply client-side filters (exclude always; category/live include also client-side)
  const filteredChannels = useMemo(() => {
    let result = channels
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(ch => ch.name.toLowerCase().includes(q))
    }
    for (const f of filters) {
      if (f.field === 'country' && f.negate) {
        result = result.filter(ch => !ch.country || ch.country !== f.value.toUpperCase())
      } else if (f.field === 'language' && f.negate) {
        result = result.filter(ch => {
          if (!ch.language) return true
          return !ch.language.split(';').map(l => l.trim()).includes(f.value)
        })
      } else if (f.field === 'category') {
        result = result.filter(ch => {
          const hit = ch.category === f.value
          return f.negate ? !hit : hit
        })
      } else if (f.field === 'live') {
        result = result.filter(ch => {
          const hit = f.value === 'true' ? ch.is_live !== false : ch.is_live === false
          return f.negate ? !hit : hit
        })
      }
    }
    return result
  }, [channels, search, filters])

  // Auto-select first channel when none selected and list loads
  useEffect(() => {
    if (channels.length && !selectedUrl) setSelectedUrl(channels[0].url)
  }, [channels.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive index into filtered list (for sidebar highlight; -1 = filtered out)
  const selectedIdx = filteredChannels.findIndex(ch => ch.url === selectedUrl)
  // Always play the selected channel regardless of search filter
  const selectedChannel = channels.find(ch => ch.url === selectedUrl) ?? null

  const availableCategories = useMemo(() =>
    [...new Set(channels.flatMap(ch => ch.category ? [ch.category] : []))].sort()
  , [channels])

  const markLive = useCallback((url: string, live: boolean) => {
    setChannels(prev => prev.map(c => c.url === url ? { ...c, is_live: live } : c))
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!filteredChannels.length) return
      const cur = filteredChannels.findIndex(ch => ch.url === selectedUrl)
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        const next = filteredChannels[Math.min(cur + 1, filteredChannels.length - 1)]
        if (next) setSelectedUrl(next.url)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const next = filteredChannels[Math.max(cur - 1, 0)]
        if (next) setSelectedUrl(next.url)
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
        <Player channel={selectedChannel} onLive={markLive} sidebarOpen={sidebarOpen} />
      </div>
    </div>
  )
}
