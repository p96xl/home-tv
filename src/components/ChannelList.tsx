import { useEffect, useRef, useState } from 'react'
import type { Channel } from '../types'

interface Props {
  channels: Channel[]
  selectedIdx: number
  loading: boolean
  search: string
  onSearch: (q: string) => void
  onSelect: (idx: number) => void
}

const dot = (ch: Channel) =>
  ch.is_live === true  ? 'bg-green-500' :
  ch.is_live === false ? 'bg-red-500/60' :
  'bg-white/15'

const HINT = [
  { ex: 'news',               desc: 'name contains "news"' },
  { ex: 'language:Ukrainian', desc: 'by language' },
  { ex: 'category:general',  desc: 'by category' },
  { ex: 'live:true',          desc: 'only live streams' },
  { ex: '-language:Russian',  desc: 'exclude Russian' },
]

export default function ChannelList({ channels, selectedIdx, loading, search, onSearch, onSelect }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    refs.current[selectedIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIdx])

  return (
    <div className="w-64 flex-shrink-0 flex flex-col border-r border-white/5 bg-black/20">

      {/* Search bar */}
      <div className="px-2 py-2 border-b border-white/5 flex-shrink-0 relative">
        <div className="flex items-center gap-1">
          <div className="flex-1 relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-xs pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Search channels…"
              className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-white/20"
            />
            {search && (
              <button
                onClick={() => onSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={() => setShowHint(h => !h)}
            className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded text-xs transition-colors ${showHint ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/60'}`}
            title="Search syntax"
          >
            ?
          </button>
        </div>

        {/* Hint popover */}
        {showHint && (
          <div className="absolute left-2 right-2 top-full mt-1 z-10 bg-zinc-800 border border-white/10 rounded-lg p-3 shadow-xl">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">Search syntax</p>
            <div className="space-y-1.5">
              {HINT.map(h => (
                <div key={h.ex} className="flex items-start gap-2">
                  <button
                    onClick={() => { onSearch(h.ex); setShowHint(false) }}
                    className="font-mono text-[11px] text-blue-300/80 hover:text-blue-300 bg-white/5 rounded px-1 leading-relaxed flex-shrink-0"
                  >
                    {h.ex}
                  </button>
                  <span className="text-[11px] text-white/35 leading-relaxed">{h.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-white/20 mt-2">Combine with spaces · prefix <code className="text-white/35">-</code> to exclude</p>
          </div>
        )}
      </div>

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
              idx === selectedIdx
                ? 'bg-blue-600/20 border-blue-500'
                : 'border-transparent hover:bg-white/5'
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
            {search ? 'No matches' : 'No channels found'}
          </p>
        )}
      </div>
    </div>
  )
}
