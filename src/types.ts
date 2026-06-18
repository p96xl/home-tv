export interface Channel {
  id: string
  name: string
  logo: string | null
  url: string
  alt_urls: string[]
  number: number
  language: string | null
  category: string | null
  country: string | null
  is_live: boolean | null
}

export interface Country {
  name: string
  code: string
  flag: string
}

export type FilterField = 'language' | 'category' | 'country'

export interface Filter {
  id: string
  field: FilterField
  value: string
  negate: boolean
}
