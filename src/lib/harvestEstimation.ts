import { getCropProfile } from './cropKnowledge'

export type HarvestEstimateInput = {
  cropName: string
  variety: string
  plantingDate: string
  referenceDate?: Date
}

export type HarvestEstimate = {
  cropName: string
  variety: string
  plantingDate: string
  referenceDate: string
  earliestHarvestDate: string
  latestHarvestDate: string
  harvestWindow: string
  daysSincePlanting: number
  daysRemainingToEarliest: number
  daysRemainingToLatest: number
  currentDevelopmentStage: string
  confidenceLabel: string
  source: string
  assumptions: string[]
  isValidated: boolean
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseDate(dateValue: string): Date {
  if (!ISO_DATE_PATTERN.test(dateValue)) {
    throw new RangeError('La date doit respecter le format AAAA-MM-JJ.')
  }

  const date = new Date(`${dateValue}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) {
    throw new RangeError('La date fournie est invalide.')
  }

  return date
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_IN_MILLISECONDS)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

export function calculateHarvestEstimate(input: HarvestEstimateInput): HarvestEstimate {
  const profile = getCropProfile(input.cropName, input.variety)
  const plantingDate = parseDate(input.plantingDate)
  const referenceDate = input.referenceDate ?? new Date()
  if (Number.isNaN(referenceDate.getTime())) {
    throw new RangeError('La date de référence fournie est invalide.')
  }

  const referenceDay = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()))
  if (plantingDate > referenceDay) {
    throw new RangeError('La date de plantation ne peut pas être dans le futur.')
  }

  const daysSincePlanting = Math.floor((referenceDay.getTime() - plantingDate.getTime()) / DAY_IN_MILLISECONDS)
  const earliestDate = addDays(plantingDate, profile.variety.minimumMaturityDays)
  const latestDate = addDays(plantingDate, profile.variety.maximumMaturityDays)
  const midpointDays = (profile.variety.minimumMaturityDays + profile.variety.maximumMaturityDays) / 2
  const maturityProgress = daysSincePlanting / midpointDays
  const currentStage = [...profile.stages]
    .reverse()
    .find((stage) => maturityProgress >= stage.maturityProgress)?.label ?? profile.stages[0].label

  return {
    cropName: profile.name,
    variety: profile.variety.name,
    plantingDate: input.plantingDate,
    referenceDate: referenceDay.toISOString().slice(0, 10),
    earliestHarvestDate: formatDate(earliestDate),
    latestHarvestDate: formatDate(latestDate),
    harvestWindow: `${formatDate(earliestDate)} – ${formatDate(latestDate)}`,
    daysSincePlanting,
    daysRemainingToEarliest: Math.ceil((earliestDate.getTime() - referenceDay.getTime()) / DAY_IN_MILLISECONDS),
    daysRemainingToLatest: Math.ceil((latestDate.getTime() - referenceDay.getTime()) / DAY_IN_MILLISECONDS),
    currentDevelopmentStage: currentStage,
    confidenceLabel: 'Faible · provisoire',
    source: profile.source,
    assumptions: profile.assumptions,
    isValidated: profile.isValidated,
  }
}
