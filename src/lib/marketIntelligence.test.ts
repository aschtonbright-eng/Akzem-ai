import { describe, expect, it } from 'vitest'
import { analyzeMarketSignals, type PriceObservation } from './marketIntelligence'

describe('market intelligence', () => {
  it('flags a strong upward price trend with a bullish recommendation', () => {
    const observations: PriceObservation[] = [
      { product: 'Tomates', market: 'Bonabéri', city: 'Douala', date: '2026-08-01', price: 520 },
      { product: 'Tomates', market: 'Bonabéri', city: 'Douala', date: '2026-08-05', price: 620 },
      { product: 'Tomates', market: 'Bonabéri', city: 'Douala', date: '2026-08-10', price: 690 },
    ]

    const signals = analyzeMarketSignals(observations)

    expect(signals).toHaveLength(1)
    expect(signals[0].trend).toBe('up')
    expect(signals[0].recommendation).toContain('optimiser')
  })

  it('marks a declining market as cautioned and recommends monitoring', () => {
    const observations: PriceObservation[] = [
      { product: 'Carottes', market: 'Mifi', city: 'Bafoussam', date: '2026-08-10', price: 540 },
      { product: 'Carottes', market: 'Mifi', city: 'Bafoussam', date: '2026-08-14', price: 500 },
      { product: 'Carottes', market: 'Mifi', city: 'Bafoussam', date: '2026-08-18', price: 470 },
    ]

    const signals = analyzeMarketSignals(observations)

    expect(signals[0].trend).toBe('down')
    expect(signals[0].recommendation).toContain('surveiller')
  })
})
