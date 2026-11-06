import { calculateHarvestEstimate, type HarvestEstimate, type HarvestEstimateInput } from './harvestEstimation'

type CropCycle = Pick<HarvestEstimateInput, 'cropName' | 'variety' | 'plantingDate'> & {
  estimate?: unknown
}

export const recalculateCropCycleEstimates = <T extends CropCycle>(
  cycles: T[],
  referenceDate: Date = new Date(),
): (Omit<T, 'estimate'> & { estimate: HarvestEstimate })[] => cycles.map((cycle) => ({
  ...cycle,
  estimate: calculateHarvestEstimate({
    cropName: cycle.cropName,
    variety: cycle.variety,
    plantingDate: cycle.plantingDate,
    referenceDate,
  }),
}))
