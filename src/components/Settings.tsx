import { useEffect, useRef } from 'react'
import type { Country, Settings } from '../types'

interface Props {
  countries: Country[]
  settings: Settings
  availableLanguages: string[]
  onUpdate: (patch: Partial<Settings>) => void
  onClose: () => void
}

export default function SettingsPanel({ countries, settings, availableLanguages, onUpdate, onClose }: Props) {
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    selectRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleLanguage = (lang: string) => {
    const current = settings.blacklisted_languages
    const next = current.includes(lang)
      ? current.filter(l => l !== lang)
      : [...current, lang]
    onUpdate({ blacklisted_languages: next })
  }

  const isBlacklisted = (lang: string) => settings.blacklisted_languages.includes(lang)

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

        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* Country */}
          <section>
            <h3 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Country</h3>
            <select
              ref={selectRef}
              value={settings.country}
              onChange={e => onUpdate({ country: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500/50 text-white"
            >
              {countries.map(c => (
                <option key={c.code} value={c.code} className="bg-zinc-900">
                  {c.flag} {c.name} ({c.code})
                </option>
              ))}
            </select>
          </section>

          {/* Language blacklist */}
          {availableLanguages.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1">Hide Languages</h3>
              <p className="text-[10px] text-white/20 mb-3">Tap a language to hide it everywhere</p>
              <div className="grid grid-cols-2 gap-2">
                {availableLanguages.map(lang => (
                  <button
                    key={lang}
                    onClick={() => toggleLanguage(lang)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                      isBlacklisted(lang)
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>{lang}</span>
                    {isBlacklisted(lang) ? <span>✕</span> : <span className="opacity-20">○</span>}
                  </button>
                ))}
              </div>
              {settings.blacklisted_languages.length > 0 && (
                <button
                  onClick={() => onUpdate({ blacklisted_languages: [] })}
                  className="mt-4 w-full py-2 text-[10px] text-white/30 hover:text-white/60 border border-dashed border-white/10 rounded-lg"
                >
                  Show all languages
                </button>
              )}
            </section>
          )}

          {/* M3U */}
          <section>
            <h3 className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">M3U Playlist</h3>
            <p className="text-xs text-white/30 mb-2">For IPTV apps and Chromecast with Google TV:</p>
            <code className="block text-[11px] text-blue-300/80 bg-black/40 rounded-lg px-3 py-2 break-all border border-white/5">
              {'https://iptv-org.github.io/iptv/countries/' + settings.country.toLowerCase() + '.m3u'}
            </code>
          </section>

        </div>
      </div>
    </div>
  )
}
