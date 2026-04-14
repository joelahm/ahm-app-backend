const { randomUUID } = require('crypto');
const { Prisma } = require('@prisma/client');
const { AppError } = require('../../lib/errors');

const GENERATED_SCHEMAS_SETTINGS_KEY = 'generated_schemas';
const ALLOWED_SCHEMA_TYPES = new Set(['homepage', 'treatment-page', 'location-page']);
const BUSINESS_HOURS_DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function buildUserDisplayName(user) {
  const firstName = asString(user?.firstName).trim();
  const lastName = asString(user?.lastName).trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return fullName || asString(user?.email) || 'Unknown';
}

function parseUnsignedBigInt(value, fieldName) {
  const normalized = asString(value).trim();

  if (!/^\d+$/.test(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is invalid.`);
  }

  return BigInt(normalized);
}

function createEmptyBusinessHours() {
  return Object.fromEntries(
    BUSINESS_HOURS_DAY_KEYS.map((day) => [
      day,
      {
        status: day === 'sunday' || day === 'thursday' ? 'closed' : 'open',
        openHour: '12',
        openMinute: '00',
        closeHour: '12',
        closeMinute: '00'
      }
    ])
  );
}

function normalizeSingleBusinessHour(value, fallback) {
  const source = asObject(value);
  const status = asString(source.status).toLowerCase() === 'closed' ? 'closed' : 'open';

  return {
    status,
    openHour: asString(source.openHour, fallback.openHour),
    openMinute: asString(source.openMinute, fallback.openMinute),
    closeHour: asString(source.closeHour, fallback.closeHour),
    closeMinute: asString(source.closeMinute, fallback.closeMinute)
  };
}

function normalizeBusinessHours(value) {
  const source = asObject(value);
  const fallback = createEmptyBusinessHours();

  return Object.fromEntries(
    BUSINESS_HOURS_DAY_KEYS.map((day) => [
      day,
      normalizeSingleBusinessHour(source[day], fallback[day])
    ])
  );
}

function normalizeArrayOfStrings(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

function normalizeValueArray(value) {
  return Array.isArray(value)
    ? value
        .map((item) => ({ value: asString(asObject(item).value).trim() }))
        .filter((item) => item.value)
    : [];
}

function normalizeService(value) {
  const source = asObject(value);

  return {
    type: asString(source.type).trim(),
    name: asString(source.name).trim(),
    link: asString(source.link).trim()
  };
}

function normalizeHospitalAffiliation(value) {
  const source = asObject(value);

  return {
    businessHours: normalizeBusinessHours(source.businessHours),
    city: asString(source.city).trim(),
    countryCode: asString(source.countryCode).trim(),
    hasMapUrl: asString(source.hasMapUrl).trim(),
    latitude: asString(source.latitude).trim(),
    longitude: asString(source.longitude).trim(),
    name: asString(source.name).trim(),
    postalCode: asString(source.postalCode).trim(),
    region: asString(source.region).trim(),
    streetAddress: asString(source.streetAddress).trim(),
    telephone: asString(source.telephone).trim(),
    url: asString(source.url).trim()
  };
}

function normalizeFormValues(value) {
  const source = asObject(value);

  return {
    businessName: asString(source.businessName).trim(),
    clientId: asString(source.clientId).trim(),
    countryCode: asString(source.countryCode).trim(),
    description: asString(source.description).trim(),
    email: asString(source.email).trim(),
    hasMapUrl: asString(source.hasMapUrl).trim(),
    hospitalAffiliations: Array.isArray(source.hospitalAffiliations)
      ? source.hospitalAffiliations.map((item) => normalizeHospitalAffiliation(item))
      : [],
    latitude: asString(source.latitude).trim(),
    locality: asString(source.locality).trim(),
    logoUrl: asString(source.logoUrl).trim(),
    longitude: asString(source.longitude).trim(),
    medicalSpecialties: normalizeArrayOfStrings(source.medicalSpecialties),
    phone: asString(source.phone).trim(),
    postalCode: asString(source.postalCode).trim(),
    region: asString(source.region).trim(),
    serviceAreas: normalizeValueArray(source.serviceAreas),
    services: Array.isArray(source.services)
      ? source.services.map((item) => normalizeService(item)).filter((item) => item.name || item.type || item.link)
      : [],
    socialProfiles: normalizeValueArray(source.socialProfiles),
    streetAddress: asString(source.streetAddress).trim(),
    type: asString(source.type).trim(),
    websiteDescription: asString(source.websiteDescription).trim(),
    websiteName: asString(source.websiteName).trim(),
    websiteUrl: asString(source.websiteUrl).trim()
  };
}

function normalizeStoredGeneratedSchema(value) {
  const source = asObject(value);
  const createdBy = asObject(source.createdBy);

  return {
    id: asString(source.id) || `schema-${randomUUID()}`,
    clientId: asString(source.clientId || asObject(source.formValues).clientId).trim(),
    clientName: asString(source.clientName).trim(),
    schemaType: asString(source.schemaType).trim(),
    previewJson: asString(source.previewJson),
    businessHours: normalizeBusinessHours(source.businessHours),
    formValues: normalizeFormValues(source.formValues),
    createdAt: asString(source.createdAt) || new Date().toISOString(),
    updatedAt: asString(source.updatedAt || source.createdAt) || new Date().toISOString(),
    createdBy: {
      id: asNumber(createdBy.id, 0),
      name: asString(createdBy.name),
      email: asString(createdBy.email)
    }
  };
}

function parseStoredGeneratedSchemasValue(value) {
  const root = asObject(value);
  const rawSchemas = Array.isArray(root.generatedSchemas) ? root.generatedSchemas : [];

  return {
    generatedSchemas: rawSchemas
      .map((item) => normalizeStoredGeneratedSchema(item))
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      )
  };
}

function normalizeSaveGeneratedSchemaPayload(payload) {
  const source = asObject(payload);
  const clientId = asString(source.clientId).trim();
  const clientName = asString(source.clientName).trim();
  const schemaType = asString(source.schemaType).trim();
  const previewJson = asString(source.previewJson).trim();
  const formValues = normalizeFormValues(source.formValues);
  const businessHours = normalizeBusinessHours(source.businessHours);

  if (!clientId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Client is required.');
  }

  if (!clientName) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Client name is required.');
  }

  if (!ALLOWED_SCHEMA_TYPES.has(schemaType)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid schema type.');
  }

  if (!previewJson) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Preview JSON is required.');
  }

  if (!formValues.businessName) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Business name is required.');
  }

  if (!formValues.type) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Schema entity type is required.');
  }

  if (!formValues.websiteUrl) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Website URL is required.');
  }

  return {
    businessHours,
    clientId,
    clientName,
    formValues,
    previewJson,
    schemaType
  };
}

function mapGeneratedSchemaRecord(record) {
  return {
    id: asString(record.id),
    clientId: String(record.clientId),
    clientName: asString(record.clientName).trim(),
    schemaType: asString(record.schemaType).trim(),
    previewJson: asString(record.previewJson),
    businessHours: normalizeBusinessHours(record.businessHours),
    formValues: normalizeFormValues(record.formValues),
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : asString(record.createdAt),
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : asString(record.updatedAt),
    createdBy: {
      id: record.creator?.id ? Number(record.creator.id) : 0,
      name: buildUserDisplayName(record.creator),
      email: asString(record.creator?.email)
    }
  };
}

async function migrateLegacyGeneratedSchemasIfNeeded({ db }) {
  const currentCount = await db.generatedSchema.count();

  if (currentCount > 0) {
    return;
  }

  const setting = await db.appSetting.findUnique({
    where: { key: GENERATED_SCHEMAS_SETTINGS_KEY }
  });

  if (!setting) {
    return;
  }

  const legacySchemas = parseStoredGeneratedSchemasValue(setting.valueJson).generatedSchemas;

  if (!legacySchemas.length) {
    return;
  }

  for (const legacySchema of legacySchemas) {
    const clientIdValue = asString(legacySchema.clientId || legacySchema.formValues.clientId).trim();

    if (!/^\d+$/.test(clientIdValue)) {
      continue;
    }

    const clientId = BigInt(clientIdValue);
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true }
    });

    if (!client) {
      continue;
    }

    let createdBy = null;
    const createdById = legacySchema.createdBy?.id;

    if (Number.isFinite(createdById) && createdById > 0) {
      const creator = await db.user.findUnique({
        where: { id: BigInt(createdById) },
        select: { id: true }
      });
      createdBy = creator ? BigInt(createdById) : null;
    }

    await db.generatedSchema.upsert({
      where: { id: legacySchema.id },
      create: {
        id: legacySchema.id,
        clientId,
        clientName: legacySchema.clientName,
        schemaType: legacySchema.schemaType,
        previewJson: legacySchema.previewJson,
        businessHours: legacySchema.businessHours,
        formValues: legacySchema.formValues,
        createdBy,
        createdAt: new Date(legacySchema.createdAt),
        updatedAt: new Date(legacySchema.updatedAt)
      },
      update: {
        clientId,
        clientName: legacySchema.clientName,
        schemaType: legacySchema.schemaType,
        previewJson: legacySchema.previewJson,
        businessHours: legacySchema.businessHours,
        formValues: legacySchema.formValues,
        createdBy,
        createdAt: new Date(legacySchema.createdAt),
        updatedAt: new Date(legacySchema.updatedAt)
      }
    });
  }
}

async function getGeneratedSchemas({ db }) {
  await migrateLegacyGeneratedSchemasIfNeeded({ db });

  const generatedSchemas = await db.generatedSchema.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  });

  return {
    generatedSchemas: generatedSchemas.map((record) => mapGeneratedSchemaRecord(record))
  };
}

async function getGeneratedSchemaById({ db, schemaId }) {
  await migrateLegacyGeneratedSchemasIfNeeded({ db });

  const generatedSchema = await db.generatedSchema.findUnique({
    where: { id: schemaId },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  });

  if (!generatedSchema) {
    throw new AppError(404, 'NOT_FOUND', 'Generated schema not found.');
  }

  return { generatedSchema: mapGeneratedSchemaRecord(generatedSchema) };
}

async function createGeneratedSchema({ db, actorUserId, payload }) {
  await migrateLegacyGeneratedSchemasIfNeeded({ db });
  const normalizedPayload = normalizeSaveGeneratedSchemaPayload(payload);
  const clientId = parseUnsignedBigInt(normalizedPayload.clientId, 'Client');

  const duplicate = await db.generatedSchema.findFirst({
    where: {
      clientId,
      schemaType: normalizedPayload.schemaType
    },
    select: { id: true }
  });

  if (duplicate) {
    throw new AppError(409, 'CONFLICT', 'A schema for this client and schema type already exists.');
  }

  const createdBy = actorUserId ? BigInt(actorUserId) : null;

  try {
    const generatedSchema = await db.generatedSchema.create({
      data: {
        id: `schema-${randomUUID()}`,
        clientId,
        clientName: normalizedPayload.clientName,
        schemaType: normalizedPayload.schemaType,
        previewJson: normalizedPayload.previewJson,
        businessHours: normalizedPayload.businessHours,
        formValues: normalizedPayload.formValues,
        createdBy
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return {
      success: true,
      generatedSchema: mapGeneratedSchemaRecord(generatedSchema)
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'A schema for this client and schema type already exists.');
    }

    throw err;
  }
}

async function updateGeneratedSchema({ db, schemaId, payload }) {
  await migrateLegacyGeneratedSchemasIfNeeded({ db });
  const normalizedPayload = normalizeSaveGeneratedSchemaPayload(payload);
  const clientId = parseUnsignedBigInt(normalizedPayload.clientId, 'Client');

  const existingSchema = await db.generatedSchema.findUnique({
    where: { id: schemaId },
    select: { id: true }
  });

  if (!existingSchema) {
    throw new AppError(404, 'NOT_FOUND', 'Generated schema not found.');
  }

  const duplicate = await db.generatedSchema.findFirst({
    where: {
      id: { not: schemaId },
      clientId,
      schemaType: normalizedPayload.schemaType
    },
    select: { id: true }
  });

  if (duplicate) {
    throw new AppError(409, 'CONFLICT', 'A schema for this client and schema type already exists.');
  }

  try {
    const generatedSchema = await db.generatedSchema.update({
      where: { id: schemaId },
      data: {
        clientId,
        clientName: normalizedPayload.clientName,
        schemaType: normalizedPayload.schemaType,
        previewJson: normalizedPayload.previewJson,
        businessHours: normalizedPayload.businessHours,
        formValues: normalizedPayload.formValues
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return {
      success: true,
      generatedSchema: mapGeneratedSchemaRecord(generatedSchema)
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'A schema for this client and schema type already exists.');
    }

    throw err;
  }
}

async function deleteGeneratedSchema({ db, schemaId }) {
  await migrateLegacyGeneratedSchemasIfNeeded({ db });

  const existingSchema = await db.generatedSchema.findUnique({
    where: { id: schemaId },
    select: { id: true }
  });

  if (!existingSchema) {
    throw new AppError(404, 'NOT_FOUND', 'Generated schema not found.');
  }

  await db.generatedSchema.delete({
    where: { id: schemaId }
  });

  return {
    success: true
  };
}

module.exports = {
  createGeneratedSchema,
  deleteGeneratedSchema,
  getGeneratedSchemaById,
  getGeneratedSchemas,
  updateGeneratedSchema
};
