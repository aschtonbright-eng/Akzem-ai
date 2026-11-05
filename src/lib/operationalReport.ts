export type ReportFarmer = {
  id?: string
  name: string
  locality: string
  status: string
}

export type ReportCropCycle = {
  id: string
  farmerName: string
  cropName: string
  cultivatedArea: string
  estimatedProduction: string
  observedStage: string | null
  estimate: {
    daysRemainingToEarliest: number
    daysRemainingToLatest: number
    harvestWindow: string
  }
}

export type OperationalReport = {
  farmerCount: number
  activeFarmerCount: number
  cycleCount: number
  totalAreaHectares: number
  declaredProductionKg: number
  harvestsWithin7Days: number
  harvestsWithin30Days: number
  overdueHarvests: number
  observedStageCoveragePercent: number
  localities: { name: string; farmerCount: number }[]
  crops: { cropName: string; cycleCount: number; areaHectares: number; productionKg: number }[]
  rows: {
    cropName: string
    farmerName: string
    locality: string
    areaHectares: number
    estimatedProductionKg: number
    observedStage: string
    harvestWindow: string
    daysToHarvest: number
  }[]
}

const parseNumber = (value: string): number => {
  const match = value.match(/-?\d[\d\s.,]*/)
  if (!match) return 0

  let normalized = match[0].replace(/\s/g, '')
  const decimalSeparator = Math.max(normalized.lastIndexOf(','), normalized.lastIndexOf('.'))
  if (decimalSeparator >= 0) {
    const integer = normalized.slice(0, decimalSeparator).replace(/[.,]/g, '')
    const fraction = normalized.slice(decimalSeparator + 1).replace(/[.,]/g, '')
    normalized = `${integer}.${fraction}`
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const parseAreaHectares = (value: string): number => parseNumber(value)

const parseProductionKg = (value: string): number => {
  const quantity = parseNumber(value)
  const unit = value.toLocaleLowerCase()
  if (/\b(t|tonne|tonnes)\b/.test(unit)) return quantity * 1000
  if (/\bg\b/.test(unit) && !/kg/.test(unit)) return quantity / 1000
  return quantity
}

const round = (value: number): number => Number(value.toFixed(2))

export const buildOperationalReport = (
  farmers: ReportFarmer[],
  cycles: ReportCropCycle[],
): OperationalReport => {
  const localityCounts = new Map<string, number>()
  for (const farmer of farmers) {
    const locality = farmer.locality.trim() || 'Non renseignée'
    localityCounts.set(locality, (localityCounts.get(locality) ?? 0) + 1)
  }

  const farmerLocalities = new Map(farmers.map((farmer) => [farmer.name, farmer.locality || 'Non renseignée']))
  const cropTotals = new Map<string, { cycleCount: number; areaHectares: number; productionKg: number }>()
  const rows = cycles.map((cycle) => {
    const areaHectares = parseAreaHectares(cycle.cultivatedArea)
    const estimatedProductionKg = parseProductionKg(cycle.estimatedProduction)
    const totals = cropTotals.get(cycle.cropName) ?? { cycleCount: 0, areaHectares: 0, productionKg: 0 }
    totals.cycleCount += 1
    totals.areaHectares += areaHectares
    totals.productionKg += estimatedProductionKg
    cropTotals.set(cycle.cropName, totals)

    return {
      cropName: cycle.cropName,
      farmerName: cycle.farmerName,
      locality: farmerLocalities.get(cycle.farmerName) ?? 'Non renseignée',
      areaHectares: round(areaHectares),
      estimatedProductionKg: round(estimatedProductionKg),
      observedStage: cycle.observedStage ?? 'Non renseigné',
      harvestWindow: cycle.estimate.harvestWindow,
      daysToHarvest: cycle.estimate.daysRemainingToEarliest,
    }
  })

  return {
    farmerCount: farmers.length,
    activeFarmerCount: farmers.filter((farmer) => farmer.status === 'Actif').length,
    cycleCount: cycles.length,
    totalAreaHectares: round(rows.reduce((total, row) => total + row.areaHectares, 0)),
    declaredProductionKg: round(rows.reduce((total, row) => total + row.estimatedProductionKg, 0)),
    harvestsWithin7Days: cycles.filter((cycle) =>
      cycle.estimate.daysRemainingToEarliest <= 7 && cycle.estimate.daysRemainingToLatest >= 0,
    ).length,
    harvestsWithin30Days: cycles.filter((cycle) =>
      cycle.estimate.daysRemainingToEarliest <= 30 && cycle.estimate.daysRemainingToLatest >= 0,
    ).length,
    overdueHarvests: cycles.filter((cycle) => cycle.estimate.daysRemainingToLatest < 0).length,
    observedStageCoveragePercent: cycles.length === 0
      ? 0
      : Math.round(cycles.filter((cycle) => cycle.observedStage).length / cycles.length * 100),
    localities: Array.from(localityCounts, ([name, farmerCount]) => ({ name, farmerCount }))
      .sort((left, right) => right.farmerCount - left.farmerCount || left.name.localeCompare(right.name)),
    crops: Array.from(cropTotals, ([cropName, totals]) => ({
      cropName,
      cycleCount: totals.cycleCount,
      areaHectares: round(totals.areaHectares),
      productionKg: round(totals.productionKg),
    })).sort((left, right) => left.cropName.localeCompare(right.cropName)),
    rows,
  }
}

const csvCell = (value: string | number): string => {
  const text = String(value)
  const protectedText = typeof value === 'string' && /^[\s]*[-=+@]/.test(text) ? `'${text}` : text
  return `"${protectedText.replace(/"/g, '""')}"`
}

export const operationalReportToCsv = (report: OperationalReport): string => {
  const header = ['Culture', 'Agriculteur', 'Localité', 'Surface (ha)', 'Production déclarée (kg)', 'Stade observé', 'Fenêtre de récolte', 'Jours avant récolte']
  const records = report.rows.map((row) => [
    row.cropName,
    row.farmerName,
    row.locality,
    row.areaHectares,
    row.estimatedProductionKg,
    row.observedStage,
    row.harvestWindow,
    row.daysToHarvest,
  ])

  return [header, ...records].map((record) => record.map(csvCell).join(',')).join('\r\n')
}
