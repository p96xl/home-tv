import { useEffect, useRef, useState } from 'react'
import type { Channel, Country, Filter, FilterField } from '../types'

interface Props {
  channels: Channel[]
  selectedIdx: number
  loading: boolean
  search: string
  onSearch: (q: string) => void
  onSelect: (idx: number) => void
  filters: Filter[]
  availableLanguages: string[]
  availableCategories: string[]
  onAddFilter: (f: Omit<Filter, 'id'>) => void
  onRemoveFilter: (id: string) => void
  countries: Country[]
}

const dot = (ch: Channel) =>
  ch.is_live === true  ? 'bg-green-500' :
  ch.is_live === false ? 'bg-red-500/60' :
  'bg-white/15'

function pillLabel(f: Filter, countries: Country[]): string {
  if (f.field === 'country') {
    const c = countries.find(c => c.code === f.value)
    return c ? `${c.flag} ${c.name}` : f.value
  }
  if (f.field === 'live') return f.value === 'true' ? '🟢 live' : '⚫ offline'
  return f.negate ? `not ${f.value}` : f.value
}

const sel = 'bg-zinc-800 border border-white/10 rounded text-xs text-white outline-none focus:border-white/20 px-2 py-1.5'

export default function ChannelList({ channels, selectedIdx, loading, search, onSearch, onSelect, filters, availableLanguages, availableCategories, onAddFilter, onRemoveFilter, countries }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [building, setBuilding] = useState(false)
  const [bField, setBField] = useState<FilterField>('country')
  const [bNegate, setBNegate] = useState(false)
  const [bValue, setBValue] = useState('')

  useEffect(() => {
    refs.current[selectedIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIdx])

  useEffect(() => { setBValue(''); setBNegate(false) }, [bField])

  const handleAdd = () => {
    if (!bValue) return
    onAddFilter({ field: bField, value: bValue, negate: bNegate })
    setBValue('')
    setBuilding(false)
    setBField('country')
    setBNegate(false)
  }

  const showIncExc = bField !== 'country'

  return (
    <div className="w-64 flex-shrink-0 flex flex-col border-r border-white/5 bg-black/20">

      {/* Search bar */}
      <div className="px-2 py-2 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-1">
          <div className="flex-1 relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-xs pointer-events-none">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-white/20"
            />
            {search && (
              <button onClick={() => onSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-xs">✕</button>
            )}
          </div>
          <button
            onClick={() => setBuilding(b => !b)}
            className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded text-sm font-bold transition-colors ${building ? 'bg-blue-500/30 text-blue-300' : 'text-white/25 hover:text-white/60'}`}
            title="Add filter"
          >
            +
          </button>
        </div>
      </div>

      {/* Active filter pills */}
      {filters.length > 0 && (
        <div className="px-2 pt-1.5 pb-1 flex flex-wrap gap-1 border-b border-white/5 flex-shrink-0">
          {filters.map(f => (
            <span
              key={f.id}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border ${
                f.field === 'country'
                  ? 'bg-zinc-700/60 border-zinc-600 text-white/70'
                  : 'bg-blue-500/15 border-blue-500/20 text-blue-200'
              }`}
            >
              {pillLabel(f, countries)}
              {f.field !== 'country' && (
                <button onClick={() => onRemoveFilter(f.id)} className="text-blue-300/50 hover:text-blue-200 leading-none">✕</button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Filter builder */}
      {building && (
        <div className="px-2 py-2 border-b border-white/5 bg-black/30 flex-shrink-0 space-y-1.5">
          <div className="flex gap-1.5">
            <select value={bField} onChange={e => setBField(e.target.value as FilterField)} className={sel + ' flex-1'}>
              <option value="country" className="bg-zinc-800">Country</option>
              <option value="language" className="bg-zinc-800">Language</option>
              <option value="category" className="bg-zinc-800">Category</option>
              <option value="live" className="bg-zinc-800">Live</option>
            </select>
            {showIncExc && (
              <select value={bNegate ? 'ex' : 'in'} onChange={e => setBNegate(e.target.value === 'ex')} className={sel + ' w-[5.5rem]'}>
                <option value="in" className="bg-zinc-800">Include</option>
                <option value="ex" className="bg-zinc-800">Exclude</option>
              </select>
            )}
          </div>
          <div className="flex gap-1.5">
            {bField === 'country' && (
              <select value={bValue} onChange={e => setBValue(e.target.value)} className={sel + ' flex-1'}>
                <option value="" className="bg-zinc-800">Pick country…</option>
                {countries.map(c => (
                  <option key={c.code} value={c.code} className="bg-zinc-800">{c.flag} {c.name}</option>
                ))}
              </select>
            )}
            {bField === 'language' && (
              <select value={bValue} onChange={e => setBValue(e.target.value)} className={sel + ' flex-1'}>
                <option value="" className="bg-zinc-800">Pick…</option>
                {availableLanguages.length === 0
                  ? <option disabled className="bg-zinc-800 text-white/40">No data — load channels first</option>
                  : availableLanguages.map(l => <option key={l} value={l} className="bg-zinc-800">{l}</option>)
                }
              </select>
            )}
            {bField === 'category' && (
              <select value={bValue} onChange={e => setBValue(e.target.value)} className={sel + ' flex-1'}>
                <option value="" className="bg-zinc-800">Pick…</option>
                {availableCategories.map(c => <option key={c} value={c} className="bg-zinc-800">{c}</option>)}
              </select>
            )}
            {bField === 'live' && (
              <select value={bValue} onChange={e => setBValue(e.target.value)} className={sel + ' flex-1'}>
                <option value="" className="bg-zinc-800">Pick…</option>
                <option value="true" className="bg-zinc-800">Live streams</option>
                <option value="false" className="bg-zinc-800">Offline</option>
              </select>
            )}
            <button
              onClick={handleAdd}
              disabled={!bValue}
              className="px-2.5 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Channel count */}
      <div className="px-3 py-1.5 border-b border-white/5 flex-shrink-0">
        <p className="text-[10px] font-mono text-white/25 uppercase tracking-widest">
          {loading ? 'Loading…' : `${channels.length} channels`}
        </p>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {channels.map((ch, idx) => (
          <button
            key={ch.id + idx}
            ref={el => { refs.current[idx] = el }}
            onClick={() => onSelect(idx)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-l-2 ${
              idx === selectedIdx ? 'bg-blue-600/20 border-blue-500' : 'border-transparent hover:bg-white/5'
            }`}
          >
            <span className="text-[10px] font-mono text-white/20 w-7 text-right flex-shrink-0">
              {String(ch.number).padStart(3, '0')}
            </span>
            {ch.logo
              ? <img src={ch.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0"
                  onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
              : <span className="w-5 h-5 flex-shrink-0" />
            }
            <span className={`flex-1 text-sm truncate ${idx === selectedIdx ? 'text-white' : 'text-white/65'}`}>
              {ch.name}
            </span>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot(ch)}`} />
          </button>
        ))}
        {!loading && !channels.length && (
          <p className="text-center text-white/20 text-xs py-12">
            {(search || filters.length > 1) ? 'No matches' : 'No channels found'}
          </p>
        )}
      </div>
    </div>
  )
}
