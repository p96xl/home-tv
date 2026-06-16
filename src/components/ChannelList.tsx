import { useEffect, useRef } from 'react'
import type { Channel } from '../types'

interface Props {
  channels: Channel[]
  selectedIdx: number
  loading: boolean
  onSelect: (idx: number) => void
}

const dot = (ch: Channel) =>
  ch.is_live === true ? 'bg-green-500' :
  ch.is_live === false ? 'bg-red-500/60' :
  'bg-white/15'

export default function ChannelList({ channels, selectedIdx, loading, onSelect }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    refs.current[selectedIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIdx])

  return (
    <div className="w-64 flex-shrink-0 flex flex-col border-r border-white/5 bg-black/20">
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
        <p className="text-[10px] font-mono text-white/25 uppercase tracking-widest">
          {loading ? 'Loading…' : `${channels.length} channels`}
        </p>
      </div>
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
          <p className="text-center text-white/20 text-xs py-12">No channels found</p>
        )}
      </div>
    </div>
  )
}
