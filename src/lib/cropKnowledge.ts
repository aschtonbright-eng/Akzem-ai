export type CropDevelopmentStage = {
  label: string
  maturityProgress: number
}

export type CropVariety = {
  name: string
  minimumMaturityDays: number
  maximumMaturityDays: number
}

export type CropProfile = {
  name: string
  varieties: CropVariety[]
  stages: CropDevelopmentStage[]
  source: string
  assumptions: string[]
  isValidated: boolean
}

export const cropKnowledge: CropProfile[] = [
  {
    name: 'Tomates',
    varieties: [
      { name: 'Hybrid', minimumMaturityDays: 70, maximumMaturityDays: 100 },
      { name: 'Locale', minimumMaturityDays: 80, maximumMaturityDays: 110 },
      { name: 'Standard', minimumMaturityDays: 75, maximumMaturityDays: 105 },
    ],
    stages: [
      { label: 'Installation', maturityProgress: 0.12 },
      { label: 'Croissance végétative', maturityProgress: 0.35 },
      { label: 'Floraison', maturityProgress: 0.58 },
      { label: 'Fructification', maturityProgress: 0.82 },
      { label: 'Maturité', maturityProgress: 1 },
    ],
    source: 'Référentiel initial Akzem; durées indicatives à valider localement.',
    assumptions: ['Durée comptée depuis la plantation au champ.', 'Conditions climatiques et pratiques culturales supposées normales.'],
    isValidated: false,
  },
  {
    name: 'Poivrons',
    varieties: [
      { name: 'Standard', minimumMaturityDays: 90, maximumMaturityDays: 120 },
      { name: 'Hybrid', minimumMaturityDays: 80, maximumMaturityDays: 110 },
      { name: 'Locale', minimumMaturityDays: 100, maximumMaturityDays: 140 },
    ],
    stages: [
      { label: 'Installation', maturityProgress: 0.12 },
      { label: 'Croissance végétative', maturityProgress: 0.34 },
      { label: 'Floraison', maturityProgress: 0.58 },
      { label: 'Fructification', maturityProgress: 0.82 },
      { label: 'Maturité', maturityProgress: 1 },
    ],
    source: 'Référentiel initial Akzem; durées indicatives à valider localement.',
    assumptions: ['Durée comptée depuis la plantation au champ.', 'Conditions climatiques et pratiques culturales supposées normales.'],
    isValidated: false,
  },
  {
    name: 'Carottes',
    varieties: [
      { name: 'Locale', minimumMaturityDays: 70, maximumMaturityDays: 100 },
      { name: 'Standard', minimumMaturityDays: 75, maximumMaturityDays: 105 },
      { name: 'Hybrid', minimumMaturityDays: 65, maximumMaturityDays: 90 },
    ],
    stages: [
      { label: 'Installation', maturityProgress: 0.12 },
      { label: 'Développement foliaire', maturityProgress: 0.36 },
      { label: 'Développement racinaire', maturityProgress: 0.7 },
      { label: 'Grossissement de la racine', maturityProgress: 0.9 },
      { label: 'Maturité', maturityProgress: 1 },
    ],
    source: 'Référentiel initial Akzem; durées indicatives à valider localement.',
    assumptions: ['Durée comptée depuis le semis.', 'Conditions climatiques et pratiques culturales supposées normales.'],
    isValidated: false,
  },
]

export function getCropProfile(cropName: string, varietyName: string): CropProfile & { variety: CropVariety } {
  const profile = cropKnowledge.find((crop) => crop.name.toLocaleLowerCase() === cropName.trim().toLocaleLowerCase())
  if (!profile) {
    throw new RangeError(`Culture non prise en charge : ${cropName}`)
  }

  const variety = profile.varieties.find((item) => item.name.toLocaleLowerCase() === varietyName.trim().toLocaleLowerCase())
  if (!variety) {
    throw new RangeError(`Variété non prise en charge pour ${profile.name} : ${varietyName}`)
  }

  return { ...profile, variety }
}
