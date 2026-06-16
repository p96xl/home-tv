export interface Channel {
  id: string
  name: string
  logo: string | null
  url: string
  number: number
  is_live: boolean | null  // null = unchecked, true = playing, false = failed
}

export interface Country {
  name: string
  code: string
  flag: string
}
