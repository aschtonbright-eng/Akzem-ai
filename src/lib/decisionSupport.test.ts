import { describe, expect, it } from 'vitest'
import { buildActionRecommendations } from './decisionSupport'

describe('decision support', () => {
  it('recommends prioritising harvest when a crop is close and the market is rising', () => {
    const recommendations = buildActionRecommendations(
      [
        {
          id: 'cycle-1',
          farmerName: 'Jean Nsom',
          cropName: 'Tomates',
          variety: 'Hybrid',
          plantingDate: '2026-08-01',
          cultivatedArea: '1.8 ha',
          estimatedProduction: '1200 kg',
          observedStage: null,
          notes: '',
          estimate: {
            earliestHarvestDate: '2026-08-12',
            latestHarvestDate: '2026-08-18',
            harvestWindow: '12-18 août',
            daysRemainingToEarliest: 2,
            daysRemainingToLatest: 8,
            currentDevelopmentStage: 'Fructification',
            confidenceLabel: 'Moyenne',
            source: 'Règle provisoire',
            assumptions: ['Durée typique de cycle'],
            referenceDate: '2026-08-10',
            isValidated: false,
          },
        },
      ],
      [
        {
          product: 'Tomates',
          market: 'Bonabéri',
          city: 'Douala',
          trend: 'up',
          changePercent: 12,
          volatility: 110,
          recommendation: 'optimiser la vente',
          signalLabel: 'Hausse forte',
        },
      ],
    )

    expect(recommendations[0].title).toContain('Tomates')
    expect(recommendations[0].priority).toBe('high')
    expect(recommendations[0].action).toContain('préparer')
  })

  it('recommends delaying a sale when a market is soft and the crop window is still long', () => {
    const recommendations = buildActionRecommendations(
      [
        {
          id: 'cycle-2',
          farmerName: 'Amina Tchou',
          cropName: 'Carottes',
          variety: 'Locale',
          plantingDate: '2026-08-01',
          cultivatedArea: '1.0 ha',
          estimatedProduction: '700 kg',
          observedStage: null,
          notes: '',
          estimate: {
            earliestHarvestDate: '2026-09-10',
            latestHarvestDate: '2026-09-20',
            harvestWindow: '10-20 sept.',
            daysRemainingToEarliest: 30,
            daysRemainingToLatest: 40,
            currentDevelopmentStage: 'Mise en place',
            confidenceLabel: 'Moyenne',
            source: 'Règle provisoire',
            assumptions: ['Durée typique de cycle'],
            referenceDate: '2026-08-10',
            isValidated: false,
          },
        },
      ],
      [
        {
          product: 'Carottes',
          market: 'Mifi',
          city: 'Bafoussam',
          trend: 'down',
          changePercent: -18,
          volatility: 90,
          recommendation: 'surveiller l’achat',
          signalLabel: 'Baisse marquée',
        },
      ],
    )

    expect(recommendations[0].priority).toBe('medium')
    expect(recommendations[0].action).toContain('stocker')
  })
})
