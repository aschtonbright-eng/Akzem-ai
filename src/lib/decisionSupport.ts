export type ActionRecommendation = {
  title: string
  cropName: string
  farmer: string
  priority: 'high' | 'medium' | 'low'
  action: string
  reason: string
}

export type DecisionSupportInput = {
  [key: string]: unknown
  farmerName: string
  cropName: string
  cultivatedArea: string
  estimate: {
    earliestHarvestDate?: string
    latestHarvestDate?: string
    daysRemainingToEarliest: number
    daysRemainingToLatest: number
    currentDevelopmentStage: string
    confidenceLabel?: string
    source?: string
    assumptions?: string[]
    referenceDate?: string
    isValidated?: boolean
    harvestWindow: string
  }
}

export type MarketSignalLike = {
  [key: string]: unknown
  product: string
  market?: string
  city?: string
  trend: 'up' | 'down' | 'stable'
  changePercent: number
  recommendation: string
  signalLabel: string
}

const priorityWeight = (priority: ActionRecommendation['priority']) => {
  if (priority === 'high') return 3
  if (priority === 'medium') return 2
  return 1
}

export const buildActionRecommendations = (
  cycles: DecisionSupportInput[],
  marketSignals: MarketSignalLike[],
): ActionRecommendation[] => {
  const recommendations: ActionRecommendation[] = cycles.map((cycle) => {
      const signal = marketSignals.find((item) => item.product.toLowerCase() === cycle.cropName.toLowerCase())

      if (cycle.estimate.daysRemainingToEarliest <= 7 && signal?.trend === 'up') {
        return {
          title: `Priorité de récolte : ${cycle.cropName}`,
          cropName: cycle.cropName,
          farmer: cycle.farmerName,
          priority: 'high',
          action: 'préparer la récolte et optimiser la vente avant la hausse du marché.',
          reason: `Le cycle est proche de la fenêtre de récolte (${cycle.estimate.harvestWindow}) et le prix du marché est en hausse de ${signal.changePercent}% (${signal.signalLabel}).`,
        }
      }

      if (cycle.estimate.daysRemainingToEarliest <= 14 && signal?.trend === 'down') {
        return {
          title: `Mise en garde : ${cycle.cropName}`,
          cropName: cycle.cropName,
          farmer: cycle.farmerName,
          priority: 'medium',
          action: 'stocker temporairement et surveiller l’achat avant d’engager la vente.',
          reason: `Le marché est en baisse de ${Math.abs(signal.changePercent)}% et la récolte arrive dans ${cycle.estimate.daysRemainingToEarliest} jours.`,
        }
      }

      if (cycle.estimate.daysRemainingToEarliest <= 14) {
        return {
          title: `Plan de suivi : ${cycle.cropName}`,
          cropName: cycle.cropName,
          farmer: cycle.farmerName,
          priority: 'medium',
          action: 'contrôler les conditions de terrain et préparer le calendrier de récolte.',
          reason: `Le cycle est au stade ${cycle.estimate.currentDevelopmentStage} avec une fenêtre de récolte proche.`,
        }
      }

      if (signal?.trend === 'down') {
        return {
          title: `Protection du revenu : ${cycle.cropName}`,
          cropName: cycle.cropName,
          farmer: cycle.farmerName,
          priority: 'medium',
          action: 'stocker temporairement et surveiller l’achat avant d’engager la vente.',
          reason: `Le marché est en baisse de ${Math.abs(signal.changePercent)}% et la récolte n’est pas encore imminente.`,
        }
      }

      if (signal?.trend === 'up') {
        return {
          title: `Opportunité commerciale : ${cycle.cropName}`,
          cropName: cycle.cropName,
          farmer: cycle.farmerName,
          priority: 'low',
          action: 'prévoir un stockage léger et ajuster le calendrier de commercialisation.',
          reason: `Le marché affiche une tendance positive (${signal.signalLabel}) avec ${signal.changePercent}% de variation.`,
        }
      }

      return {
        title: `Suivi standard : ${cycle.cropName}`,
        cropName: cycle.cropName,
        farmer: cycle.farmerName,
        priority: 'low',
        action: 'continuer le suivi agronomique et confirmer les besoins en logistique.',
        reason: `Le cycle reste dans une fenêtre de récolte plus lointaine; le marché est stable ou non prioritaire.`,
      }
    })

  return recommendations.sort(
    (left, right) => priorityWeight(right.priority) - priorityWeight(left.priority),
  )
}
