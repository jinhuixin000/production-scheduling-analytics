const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const int = (x: number) => nf0.format(x)
export const dec1 = (x: number) => nf1.format(x)
export const dec2 = (x: number) => nf2.format(x)
export const usd = (x: number) => `$${nf2.format(x)}`
export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`

/** 1234567 -> "1.23M"; keeps three significant figures for hero numbers. */
export function compact(x: number): string {
  const a = Math.abs(x)
  if (a >= 1e9) return `${(x / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(x / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${(x / 1e3).toFixed(1)}K`
  return nf0.format(x)
}

export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`
export const hourRange = (h: number) => `${hourLabel(h)}–${String(h).padStart(2, '0')}:59`
export const bytes = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e3).toFixed(0)} KB`)
