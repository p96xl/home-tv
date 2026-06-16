export interface Channel {
  id: string
  name: string
  logo: string | null
  url: string
  number: number
  language: string | null
  is_live: boolean | null
}

export interface Country {
  name: string
  code: string
  flag: string
}

export interface Settings {
  country: string
  blacklisted_languages: string[]
}
