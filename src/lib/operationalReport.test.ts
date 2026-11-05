import { describe, expect, it } from 'vitest'
import { buildOperationalReport, operationalReportToCsv } from './operationalReport'

const farmers = [
  { id: 'f-1', name: 'Jean Nsom', locality: 'Douala', status: 'Actif' as const },
  { id: 'f-2', name: 'Amina Tchou', locality: 'Bafoussam', status: 'Actif' as const },
  { id: 'f-3', name: 'Paul Kengne', locality: 'Douala', status: 'En attente' as const },
]

const cycles = [
  {
    id: 'c-1', farmerName: 'Jean Nsom', cropName: 'Tomates', cultivatedArea: '1.8 ha',
    estimatedProduction: '1 200 kg', observedStage: 'Floraison',
    estimate: { daysRemainingToEarliest: 5, daysRemainingToLatest: 12, harvestWindow: '15-22 nov.' },
  },
  {
    id: 'c-2', farmerName: 'Amina Tchou', cropName: 'Carottes', cultivatedArea: '0,9 ha',
    estimatedProduction: '0.64 t', observedStage: null,
    estimate: { daysRemainingToEarliest: -4, daysRemainingToLatest: 3, harvestWindow: '1-8 nov.' },
  },
]

describe('operational reports', () => {
  it('aggregates live farmer and crop-cycle indicators', () => {
    const report = buildOperationalReport(farmers, cycles)

    expect(report.farmerCount).toBe(3)
    expect(report.activeFarmerCount).toBe(2)
    expect(report.localities).toEqual([
      { name: 'Douala', farmerCount: 2 },
      { name: 'Bafoussam', farmerCount: 1 },
    ])
    expect(report.cycleCount).toBe(2)
    expect(report.totalAreaHectares).toBe(2.7)
    expect(report.declaredProductionKg).toBe(1840)
    expect(report.harvestsWithin7Days).toBe(2)
    expect(report.harvestsWithin30Days).toBe(2)
    expect(report.observedStageCoveragePercent).toBe(50)
    expect(report.crops.map((crop) => crop.cropName)).toEqual(['Carottes', 'Tomates'])
  })

  it('exports report rows as escaped CSV', () => {
    const csv = operationalReportToCsv(buildOperationalReport(farmers, cycles))

    expect(csv).toContain('"Culture","Agriculteur","Localité"')
    expect(csv).toContain('"Tomates","Jean Nsom","Douala"')
    expect(csv).toContain('"Carottes","Amina Tchou","Bafoussam"')
    expect(csv).toContain('"-4"')
  })

  it('neutralizes spreadsheet formulas in text fields', () => {
    const report = buildOperationalReport(
      [{ id: 'f-4', name: '=2+2', locality: 'Douala', status: 'Actif' }],
      [{
        id: 'c-3', farmerName: '=2+2', cropName: 'Tomates', cultivatedArea: '1 ha',
        estimatedProduction: '500 kg', observedStage: null,
        estimate: { daysRemainingToEarliest: 2, daysRemainingToLatest: 6, harvestWindow: 'Cette semaine' },
      }],
    )

    expect(operationalReportToCsv(report)).toContain("\"'=2+2\"")
  })

  it('returns zeroed aggregates for an empty dataset', () => {
    const report = buildOperationalReport([], [])

    expect(report.farmerCount).toBe(0)
    expect(report.totalAreaHectares).toBe(0)
    expect(report.declaredProductionKg).toBe(0)
    expect(report.crops).toEqual([])
  })
})
