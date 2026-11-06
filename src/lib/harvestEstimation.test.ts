import { describe, expect, it } from 'vitest'
import { cropKnowledge } from './cropKnowledge'
import { calculateHarvestEstimate } from './harvestEstimation'

describe('calculateHarvestEstimate', () => {
  it('calculates the crop maturity window from planting date and variety rules', () => {
    const estimate = calculateHarvestEstimate({
      cropName: 'Tomates',
      variety: 'Hybrid',
      plantingDate: '2026-01-01',
      referenceDate: new Date('2026-03-12T12:00:00.000Z'),
    })

    expect(estimate.daysSincePlanting).toBe(70)
    expect(estimate.daysRemainingToEarliest).toBe(0)
    expect(estimate.daysRemainingToLatest).toBe(30)
    expect(estimate.currentDevelopmentStage).toBe('Fructification')
    expect(estimate.isValidated).toBe(false)
    expect(estimate.earliestHarvestDate).toBe('12 mars 2026')
    expect(estimate.latestHarvestDate).toBe('11 avr. 2026')
  })

  it('uses the earliest date as the upcoming harvest boundary', () => {
    const estimate = calculateHarvestEstimate({
      cropName: 'Carottes',
      variety: 'Locale',
      plantingDate: '2026-02-01',
      referenceDate: new Date('2026-02-20T00:00:00.000Z'),
    })

    expect(estimate.daysRemainingToEarliest).toBe(51)
    expect(estimate.daysRemainingToLatest).toBe(81)
    expect(estimate.currentDevelopmentStage).toBe('Installation')
  })

  it('marks the latest maturity date as the end of the harvest window', () => {
    const estimate = calculateHarvestEstimate({
      cropName: 'Tomates',
      variety: 'Hybrid',
      plantingDate: '2026-01-01',
      referenceDate: new Date('2026-04-11T00:00:00.000Z'),
    })

    expect(estimate.daysRemainingToEarliest).toBe(-30)
    expect(estimate.daysRemainingToLatest).toBe(0)
    expect(estimate.currentDevelopmentStage).toBe('Maturité')
  })

  it('uses the configured maturity window for every supported crop variety', () => {
    for (const crop of cropKnowledge) {
      for (const variety of crop.varieties) {
        const estimate = calculateHarvestEstimate({
          cropName: crop.name,
          variety: variety.name,
          plantingDate: '2026-01-01',
          referenceDate: new Date('2026-01-01T00:00:00.000Z'),
        })

        expect(estimate.daysRemainingToEarliest).toBe(variety.minimumMaturityDays)
        expect(estimate.daysRemainingToLatest).toBe(variety.maximumMaturityDays)
        expect(estimate.currentDevelopmentStage).toBe(crop.stages[0].label)
      }
    }
  })

  it('rejects invalid dates, future planting dates, and unsupported crop varieties', () => {
    const baseInput = { cropName: 'Tomates', variety: 'Hybrid', referenceDate: new Date('2026-04-01T00:00:00.000Z') }

    expect(() => calculateHarvestEstimate({ ...baseInput, plantingDate: '2026-02-30' })).toThrow(RangeError)
    expect(() => calculateHarvestEstimate({ ...baseInput, plantingDate: '2026-04-02' })).toThrow(RangeError)
    expect(() => calculateHarvestEstimate({ ...baseInput, cropName: 'Maïs', plantingDate: '2026-03-01' })).toThrow(RangeError)
    expect(() => calculateHarvestEstimate({ ...baseInput, variety: 'Unknown', plantingDate: '2026-03-01' })).toThrow(RangeError)
  })
})
