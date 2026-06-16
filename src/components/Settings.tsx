import { useState, useEffect, useRef } from 'react'
import type { Country } from '../types'

interface Props {
  countries: Country[]
  currentCountry: string
  onCountryChange: (code: string) => void
  onClose: () => void
}

export default function Settings({ countries, currentCountry, onCountryChange, onClose }: Props) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = countries.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-80 h-full bg-zinc-900 border-l border-white/10 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 h-12 border-b border-white/10 flex-shrink-0">
          <span className="font-semibold text-sm">Settings</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-white/50 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <section>
            <h3 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Country</h3>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search countries…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500/50 text-white placeholder:text-white/20 mb-2"
            />
            <div className="max-h-80 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
              {filtered.map(c => (
                <button
                  key={c.code}
                  onClick={() => onCountryChange(c.code)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-white/5 transition-colors ${
                    c.code === currentCountry ? 'bg-blue-600/20 text-blue-300' : 'text-white/75'
                  }`}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-[10px] font-mono text-white/25">{c.code}</span>
                </button>
              ))}
              {!filtered.length && (
                <p className="text-center text-xs text-white/20 py-4">No results</p>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">M3U Playlist</h3>
            <p className="text-xs text-white/30 mb-2">For IPTV apps and Chromecast with Google TV:</p>
            <code className="block text-[11px] text-blue-300/80 bg-black/40 rounded-lg px-3 py-2 break-all border border-white/5">
              {'https://iptv-org.github.io/iptv/index.country.' + currentCountry.toLowerCase() + '.m3u'}
            </code>
          </section>
        </div>
      </div>
    </div>
  )
}
