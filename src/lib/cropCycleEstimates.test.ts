import { describe, expect, it } from 'vitest'
import { recalculateCropCycleEstimates } from './cropCycleEstimates'
import { buildActionRecommendations } from './decisionSupport'
import { buildOperationalReport } from './operationalReport'

describe('recalculateCropCycleEstimates', () => {
  it('refreshes persisted estimate snapshots using one reference date', () => {
    const cycles = recalculateCropCycleEstimates(
      [
        {
          id: 'cycle-1',
          farmerName: 'Jean Nsom',
          cropName: 'Tomates',
          variety: 'Hybrid',
          plantingDate: '2026-01-01',
          cultivatedArea: '1,8 ha',
          estimatedProduction: '1 200 kg',
          observedStage: null,
          estimate: { daysRemainingToEarliest: 99, currentDevelopmentStage: 'Installation' },
        },
      ],
      new Date('2026-03-12T12:00:00.000Z'),
    )

    expect(cycles[0].estimate.daysRemainingToEarliest).toBe(0)
    expect(cycles[0].estimate.currentDevelopmentStage).toBe('Fructification')
    expect(cycles[0].farmerName).toBe('Jean Nsom')

    const report = buildOperationalReport(
      [{ id: 'farmer-1', name: 'Jean Nsom', locality: 'Douala', status: 'Actif' }],
      cycles,
    )
    const recommendations = buildActionRecommendations(cycles, [
      {
        product: 'Tomates',
        trend: 'up',
        changePercent: 12,
        recommendation: 'optimiser la vente',
        signalLabel: 'Hausse forte',
      },
    ])

    expect(report.harvestsWithin7Days).toBe(1)
    expect(report.harvestsWithin30Days).toBe(1)
    expect(report.totalAreaHectares).toBe(1.8)
    expect(recommendations[0].priority).toBe('high')
  })
})
