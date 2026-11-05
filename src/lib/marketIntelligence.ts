export type PriceObservation = {
  product: string
  market: string
  city: string
  date: string
  price: number
}

export type MarketSignal = {
  product: string
  market: string
  city: string
  trend: 'up' | 'down' | 'stable'
  changePercent: number
  volatility: number
  recommendation: string
  signalLabel: string
}

const parsePrice = (value: string) => {
  const numeric = Number.parseFloat(value.replace(/[^\d.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

export const analyzeMarketSignals = (observations: PriceObservation[]): MarketSignal[] => {
  const grouped = new Map<string, PriceObservation[]>()

  for (const observation of observations) {
    const key = `${observation.product}:${observation.market}`
    const current = grouped.get(key) ?? []
    current.push(observation)
    grouped.set(key, current)
  }

  return Array.from(grouped.values())
    .map((entries) => {
      const sorted = [...entries].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
      const first = sorted[0] ?? { price: 0 }
      const latest = sorted[sorted.length - 1] ?? first
      const changePercent = first.price === 0 ? 0 : ((latest.price - first.price) / first.price) * 100
      const averagePrice = sorted.reduce((total, item) => total + item.price, 0) / sorted.length
      const volatility = sorted.reduce((total, item) => total + Math.abs(item.price - averagePrice), 0) / sorted.length

      let trend: MarketSignal['trend'] = 'stable'
      let signalLabel = 'Stabilité'
      let recommendation = 'surveiller la tendance avant de prendre une décision.'

      if (changePercent > 8) {
        trend = 'up'
        signalLabel = 'Hausse forte'
        recommendation = 'optimiser la vente pour sécuriser la marge et préparer le stockage.'
      } else if (changePercent < -8) {
        trend = 'down'
        signalLabel = 'Baisse marquée'
        recommendation = 'surveiller l’achat et ajuster la planification des livraisons.'
      }

      return {
        product: latest.product,
        market: latest.market,
        city: latest.city,
        trend,
        changePercent: Number(changePercent.toFixed(1)),
        volatility: Number(volatility.toFixed(1)),
        recommendation,
        signalLabel,
      }
    })
    .sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent))
}

export const toPriceObservation = (price: {
  product: string
  market: string
  city: string
  date: string
  price: string
}): PriceObservation => ({
  product: price.product,
  market: price.market,
  city: price.city,
  date: price.date,
  price: parsePrice(price.price),
})
