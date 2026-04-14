const { AppError } = require('../../lib/errors');

const SCHEMA_GENERATOR_SETTINGS_KEY = 'schema_generator_settings';
const DEFAULT_SCHEMA_TYPES = [
  'Dentist',
  'EmergencyService',
  'Hospital',
  'MedicalBusiness',
  'MedicalClinic',
  'Optician',
  'Pharmacy',
  'Physician',
  'VeterinaryCare'
];
const DEFAULT_MEDICAL_SPECIALTIES = [
  'Anesthesia',
  'Cardiovascular',
  'CommunityHealth',
  'Dentistry',
  'Dermatology',
  'DietNutrition',
  'Emergency',
  'Endocrine',
  'Gastroenterologic',
  'Genetic',
  'Geriatric',
  'Gynecologic',
  'Hematologic',
  'Infectious',
  'LaboratoryScience',
  'Midwifery',
  'Musculoskeletal',
  'Neurologic',
  'Nursing',
  'Obstetric',
  'Oncologic',
  'Optometric',
  'Otolaryngologic',
  'Pathology',
  'Pediatric',
  'PharmacySpecialty',
  'Physiotherapy',
  'PlasticSurgery',
  'Podiatric',
  'PrimaryCare',
  'Psychiatric',
  'PublicHealth',
  'Pulmonary',
  'Radiography',
  'Renal',
  'RespiratoryTherapy',
  'Rheumatologic',
  'SpeechPathology',
  'Surgical',
  'Toxicologic',
  'Urologic'
];

const MEDICAL_SPECIALTY_VALUE_MAP = Object.fromEntries(
  DEFAULT_MEDICAL_SPECIALTIES.map((label) => [label, `https://schema.org/${label}`])
);
const DEFAULT_SERVICE_TYPES = [
  'MedicalProcedure',
  'MedicalTest',
  'MedicalTherapy'
];

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeOption(value, index, prefix) {
  const source = typeof value === 'string' ? { label: value } : asObject(value);
  const label = asString(source.label || source.value || source.name).trim();

  if (!label) {
    return null;
  }

  const providedValue = asString(source.value).trim();
  const fallbackValue =
    prefix === 'medical-specialty'
      ? MEDICAL_SPECIALTY_VALUE_MAP[label] || label
      : label;
  const normalizedValue =
    prefix === 'medical-specialty'
      ? providedValue.startsWith('https://schema.org/')
        ? providedValue
        : MEDICAL_SPECIALTY_VALUE_MAP[label] || fallbackValue
      : providedValue || fallbackValue;

  return {
    id: asString(source.id).trim() || `${prefix}-${index + 1}`,
    label,
    value: normalizedValue
  };
}

function buildDefaultSettings() {
  return {
    medicalSpecialties: DEFAULT_MEDICAL_SPECIALTIES.map((label, index) => ({
      id: `medical-specialty-${index + 1}`,
      label,
      value: MEDICAL_SPECIALTY_VALUE_MAP[label]
    })),
    serviceTypes: DEFAULT_SERVICE_TYPES.map((label, index) => ({
      id: `service-type-${index + 1}`,
      label,
      value: label
    })),
    types: DEFAULT_SCHEMA_TYPES.map((label, index) => ({
      id: `schema-type-${index + 1}`,
      label,
      value: label
    }))
  };
}

function normalizeOptionList(items, prefix, fallbackItems) {
  if (!Array.isArray(items) || !items.length) {
    return fallbackItems;
  }

  const nextItems = items
    .map((item, index) => normalizeOption(item, index, prefix))
    .filter(Boolean)
    .filter(
      (item, index, current) =>
        current.findIndex((entry) => entry.value === item.value) === index
    );

  return nextItems.length ? nextItems : fallbackItems;
}

function parseStoredSchemaSettingsValue(value) {
  const root = asObject(value);
  const defaults = buildDefaultSettings();

  return {
    medicalSpecialties: normalizeOptionList(
      root.medicalSpecialties,
      'medical-specialty',
      defaults.medicalSpecialties
    ),
    serviceTypes: normalizeOptionList(
      root.serviceTypes,
      'service-type',
      defaults.serviceTypes
    ),
    types: normalizeOptionList(root.types, 'schema-type', defaults.types)
  };
}

async function persistSchemaSettings({ db, settings }) {
  await db.appSetting.upsert({
    where: { key: SCHEMA_GENERATOR_SETTINGS_KEY },
    create: {
      key: SCHEMA_GENERATOR_SETTINGS_KEY,
      valueJson: settings
    },
    update: {
      valueJson: settings
    }
  });
}

async function getSchemaSettings({ db }) {
  const setting = await db.appSetting.findUnique({
    where: { key: SCHEMA_GENERATOR_SETTINGS_KEY }
  });

  const settings = parseStoredSchemaSettingsValue(setting?.valueJson);

  if (!setting) {
    await persistSchemaSettings({ db, settings });
  }

  return settings;
}

async function getSchemaTypes({ db }) {
  const settings = await getSchemaSettings({ db });
  return { types: settings.types };
}

async function getMedicalSpecialties({ db }) {
  const settings = await getSchemaSettings({ db });
  return { medicalSpecialties: settings.medicalSpecialties };
}

async function getServiceTypes({ db }) {
  const settings = await getSchemaSettings({ db });
  return { serviceTypes: settings.serviceTypes };
}

async function replaceSchemaTypes({ db, payload }) {
  const source = asObject(payload);
  const nextTypes = Array.isArray(source.types)
    ? source.types
        .map((item, index) => normalizeOption(item, index, 'schema-type'))
        .filter(Boolean)
    : [];

  if (!nextTypes.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one schema type is required.');
  }

  const settings = await getSchemaSettings({ db });
  const nextSettings = {
    ...settings,
    types: nextTypes.filter(
      (item, index, current) =>
        current.findIndex((entry) => entry.value === item.value) === index
    )
  };

  await persistSchemaSettings({ db, settings: nextSettings });

  return { types: nextSettings.types };
}

async function replaceMedicalSpecialties({ db, payload }) {
  const source = asObject(payload);
  const nextItems = Array.isArray(source.medicalSpecialties)
    ? source.medicalSpecialties
        .map((item, index) => normalizeOption(item, index, 'medical-specialty'))
        .filter(Boolean)
    : [];

  if (!nextItems.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one medical specialty is required.');
  }

  const settings = await getSchemaSettings({ db });
  const nextSettings = {
    ...settings,
    medicalSpecialties: nextItems.filter(
      (item, index, current) =>
        current.findIndex((entry) => entry.value === item.value) === index
    )
  };

  await persistSchemaSettings({ db, settings: nextSettings });

  return { medicalSpecialties: nextSettings.medicalSpecialties };
}

async function replaceServiceTypes({ db, payload }) {
  const source = asObject(payload);
  const nextItems = Array.isArray(source.serviceTypes)
    ? source.serviceTypes
        .map((item, index) => normalizeOption(item, index, 'service-type'))
        .filter(Boolean)
    : [];

  if (!nextItems.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one service type is required.');
  }

  const settings = await getSchemaSettings({ db });
  const nextSettings = {
    ...settings,
    serviceTypes: nextItems.filter(
      (item, index, current) =>
        current.findIndex((entry) => entry.value === item.value) === index
    )
  };

  await persistSchemaSettings({ db, settings: nextSettings });

  return { serviceTypes: nextSettings.serviceTypes };
}

module.exports = {
  getMedicalSpecialties,
  getSchemaTypes,
  getServiceTypes,
  replaceMedicalSpecialties,
  replaceSchemaTypes,
  replaceServiceTypes
};
