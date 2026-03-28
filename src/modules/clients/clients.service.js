const { AppError } = require('../../lib/errors');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRACTICE_HOURS_KEY_REGEX = /^practiceHours\[(\d+)\]\[(.+)\]$/;
const FILE_COLUMN_MAP = {
  highQualityHeadshot: 'highQualityHeadshot',
  yourCv: 'yourCv',
  practiceLocationInteriorPhoto: 'practiceLocationInteriorPhoto',
  practiceLocationExteriorPhoto: 'practiceLocationExteriorPhoto',
  colorGuide: 'colorGuide',
  logo: 'logo'
};
const ALLOWED_CLIENT_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'DELETED']);
const ALLOWED_CITATION_STATUSES = new Set([
  'NOT_SYNCED',
  'LIVE_CITATION',
  'PENDING',
  'REJECTED',
  'IN_REVIEW'
]);
const ASSIGNED_USER_INCLUDE = {
  assignedUser: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true
    }
  }
};
const PROJECT_INCLUDE = {
  clientSuccessManager: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true
    }
  },
  accountManager: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true
    }
  }
};
const CLIENT_LIST_PROJECT_INCLUDE = {
  select: {
    id: true,
    project: true,
    phase: true,
    progress: true,
    createdAt: true,
    updatedAt: true
  },
  orderBy: {
    createdAt: 'desc'
  }
};

function toJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [];
}

function parseClientStatus(value, fieldName = 'status', fallback = undefined) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be ACTIVE, INACTIVE, or DELETED.`
    );
  }

  if (!ALLOWED_CLIENT_STATUSES.has(normalized)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be ACTIVE, INACTIVE, or DELETED.`
    );
  }

  return normalized;
}

function mapClient(client) {
  const projects = Array.isArray(client.projects) ? client.projects : [];
  const assignedTo = client.assignedUser
    ? {
      id: Number(client.assignedUser.id),
      firstName: client.assignedUser.firstName ?? null,
      lastName: client.assignedUser.lastName ?? null,
      avatar: client.assignedUser.avatarUrl ?? null
    }
    : (client.assignedTo
      ? {
        id: Number(client.assignedTo),
        firstName: null,
        lastName: null,
        avatar: null
      }
      : null);

  return {
    id: Number(client.id),
    clientName: client.clientName,
    businessName: client.businessName,
    niche: client.niche,
    personalEmail: client.personalEmail,
    practiceEmail: client.practiceEmail,
    businessPhone: client.businessPhone,
    website: client.website,
    country: client.country,
    typeOfPractice: client.typeOfPractice ?? null,
    profession: client.profession ?? null,
    topMedicalSpecialties: toJsonArray(client.topMedicalSpecialties),
    otherMedicalSpecialties: toJsonArray(client.otherMedicalSpecialties),
    subSpecialties: toJsonArray(client.subSpecialties),
    specialInterests: toJsonArray(client.specialInterests),
    topTreatments: toJsonArray(client.topTreatments),
    practiceIntroduction: client.practiceIntroduction ?? null,
    uniqueToCompetitors: client.uniqueToCompetitors ?? null,
    highQualityHeadshot: toJsonArray(client.highQualityHeadshot),
    yourCv: toJsonArray(client.yourCv),
    practiceLocationInteriorPhoto: toJsonArray(client.practiceLocationInteriorPhoto),
    practiceLocationExteriorPhoto: toJsonArray(client.practiceLocationExteriorPhoto),
    addressLine1: client.addressLine1 ?? null,
    addressLine2: client.addressLine2 ?? null,
    cityState: client.cityState ?? null,
    postCode: client.postCode ?? null,
    visibleArea: client.visibleArea ?? null,
    practiceHours: toJsonArray(client.practiceHours),
    gbpLink: client.gbpLink ?? null,
    facebook: client.facebook ?? null,
    instagram: client.instagram ?? null,
    linkedin: client.linkedin ?? null,
    websiteLoginLink: client.websiteLoginLink ?? null,
    websiteUsername: client.websiteUsername ?? null,
    websitePassword: client.websitePassword ?? null,
    googleAnalytics: client.googleAnalytics ?? null,
    googleSearchConsole: client.googleSearchConsole ?? null,
    colorGuide: toJsonArray(client.colorGuide),
    logo: toJsonArray(client.logo),
    treatmentAndServices: toJsonArray(client.treatmentAndServices),
    conditionsTreated: toJsonArray(client.conditionsTreated),
    status: client.status ?? null,
    assignedToId: client.assignedTo ? Number(client.assignedTo) : null,
    assignedTo,
    projects: projects
      .map((project) => String(project.project || '').trim())
      .filter(Boolean),
    createdBy: client.createdBy ? Number(client.createdBy) : null,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt
  };
}

function mapProjectUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    avatar: user.avatarUrl ?? null
  };
}

function formatCitationStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  switch (normalized) {
    case 'LIVE_CITATION':
      return 'Live Citation';
    case 'PENDING':
      return 'Pending';
    case 'REJECTED':
      return 'Rejected';
    case 'IN_REVIEW':
      return 'In Review';
    case 'NOT_SYNCED':
    default:
      return 'Not Synced';
  }
}

function mapClientCitation(citation) {
  return {
    id: Number(citation.id),
    clientId: Number(citation.clientId),
    directoryName: citation.directoryName,
    status: formatCitationStatus(citation.status),
    profileUrl: citation.profileUrl ?? null,
    username: citation.username ?? null,
    password: citation.password ?? null,
    notes: citation.notes ?? null,
    createdBy: citation.createdBy ? Number(citation.createdBy) : null,
    createdAt: citation.createdAt,
    updatedAt: citation.updatedAt
  };
}

function mapClientProject(project) {
  return {
    id: Number(project.id),
    clientId: Number(project.clientId),
    project: project.project,
    clientSuccessManagerId: project.clientSuccessManagerId ? Number(project.clientSuccessManagerId) : null,
    accountManagerId: project.accountManagerId ? Number(project.accountManagerId) : null,
    clientSuccessManager: mapProjectUser(project.clientSuccessManager),
    accountManager: mapProjectUser(project.accountManager),
    phase: project.phase,
    progress: project.progress,
    createdBy: project.createdBy ? Number(project.createdBy) : null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function mapClientGbpDetails(log) {
  const raw = log.responsePayload ?? null;
  const placeResults = raw?.place_results || raw?.local_results?.[0] || null;
  const searchMetadata = raw?.search_metadata || null;

  return {
    logId: Number(log.id),
    clientId: log.clientId ? Number(log.clientId) : null,
    provider: log.provider,
    operation: log.operation,
    fetchedAt: log.createdAt,
    details: {
      placeId: placeResults?.place_id ?? raw?.place_id ?? null,
      dataCid: placeResults?.data_id ?? raw?.data_id ?? null,
      title: placeResults?.title ?? raw?.title ?? null,
      address: placeResults?.address ?? null,
      phone: placeResults?.phone ?? null,
      website: placeResults?.website ?? null,
      rating: placeResults?.rating ?? null,
      reviews: placeResults?.reviews ?? null,
      type: placeResults?.type ?? null,
      gpsCoordinates: placeResults?.gps_coordinates ?? null,
      hours: placeResults?.hours ?? null
    },
    searchMetadata,
    raw
  };
}

function mapClientGbpProfile(profile) {
  const coordinates = profile.gpsCoordinates
    ?? profile.rawSnapshot?.place_results?.gps_coordinates
    ?? profile.rawSnapshot?.local_results?.[0]?.gps_coordinates
    ?? null;

  return {
    profileId: Number(profile.id),
    clientId: Number(profile.clientId),
    provider: profile.provider,
    lastSyncedAt: profile.lastSyncedAt,
    coordinates,
    details: {
      placeId: profile.placeId,
      dataCid: profile.dataCid ?? null,
      title: profile.title ?? null,
      address: profile.address ?? null,
      phone: profile.phone ?? null,
      website: profile.website ?? null,
      rating: profile.rating === null || profile.rating === undefined ? null : Number(profile.rating),
      reviews: profile.reviewsCount ?? null,
      type: profile.businessType ?? null,
      gpsCoordinates: coordinates,
      coordinates,
      hours: profile.hours ?? null
    },
    raw: profile.rawSnapshot ?? null
  };
}

function parseWebsite(website) {
  const value = String(website || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'website must be a valid URL.');
  }
}

function parseOptionalUrl(value, fieldName) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  try {
    return new URL(normalized).toString();
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid URL.`);
  }
}

function parseOptionalEmail(value, fieldName) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (!EMAIL_REGEX.test(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid email.`);
  }
  return normalized;
}

function parseOptionalString(value) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  return normalized || null;
}

function parseOptionalUserId(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer.`);
  }
  return BigInt(id);
}

function parseCitationStatus(value, fieldName = 'status', fallback = undefined) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!normalized) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be NOT_SYNCED, LIVE_CITATION, PENDING, REJECTED, or IN_REVIEW.`
    );
  }

  if (!ALLOWED_CITATION_STATUSES.has(normalized)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be NOT_SYNCED, LIVE_CITATION, PENDING, REJECTED, or IN_REVIEW.`
    );
  }

  return normalized;
}

function parseRequiredCitationDirectory(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', 'directoryName is required.');
  }

  return normalized;
}

function parseRequiredUserId(value, fieldName) {
  const parsed = parseOptionalUserId(value, fieldName);
  if (parsed === null || parsed === undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is required.`);
  }
  return parsed;
}

function parseStringArray(raw) {
  if (raw === undefined) return undefined;

  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof raw === 'string') {
    const value = raw.trim();
    if (!value) return [];

    if (value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item || '').trim()).filter(Boolean);
        }
      } catch {
        // Fall back to single-item array below.
      }
    }

    return [value];
  }

  return [];
}

function readArrayField(payload, field) {
  const direct = payload[field];
  const bracket = payload[`${field}[]`];
  const raw = direct !== undefined ? direct : bracket;
  return parseStringArray(raw);
}

function parseBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function parsePracticeHours(payload) {
  if (payload.practiceHours !== undefined) {
    if (Array.isArray(payload.practiceHours)) return payload.practiceHours;
    if (typeof payload.practiceHours === 'string') {
      const value = payload.practiceHours.trim();
      if (!value) return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        throw new AppError(400, 'VALIDATION_ERROR', 'practiceHours must be a valid array.');
      }
    }
    return [];
  }

  const grouped = new Map();
  let hasBracketedPracticeHours = false;
  for (const [key, value] of Object.entries(payload)) {
    const match = key.match(PRACTICE_HOURS_KEY_REGEX);
    if (!match) continue;
    hasBracketedPracticeHours = true;
    const index = Number(match[1]);
    const field = match[2];
    const current = grouped.get(index) || {};
    current[field] = value;
    grouped.set(index, current);
  }

  if (!hasBracketedPracticeHours) return undefined;

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => ({
      day: parseOptionalString(row.day),
      enabled: parseBooleanLike(row.enabled),
      startTime: parseOptionalString(row.startTime),
      startMeridiem: parseOptionalString(row.startMeridiem),
      endTime: parseOptionalString(row.endTime),
      endMeridiem: parseOptionalString(row.endMeridiem)
    }));
}

function normalizeUploadFieldName(fieldName) {
  return String(fieldName || '').replace(/\[\]$/, '');
}

function buildClientPatch({ payload, files, existingClient }) {
  const assignedToRaw = payload.assignedTo !== undefined ? payload.assignedTo : payload.assignedToId;
  const patch = {
    clientName: parseOptionalString(payload.clientName),
    businessName: parseOptionalString(payload.businessName),
    niche: parseOptionalString(payload.niche),
    personalEmail: parseOptionalEmail(payload.personalEmail, 'personalEmail'),
    practiceEmail: parseOptionalEmail(payload.practiceEmail, 'practiceEmail'),
    businessPhone: parseOptionalString(payload.businessPhone),
    website: parseOptionalUrl(payload.website, 'website'),
    country: parseOptionalString(payload.country),
    typeOfPractice: parseOptionalString(payload.typeOfPractice),
    profession: parseOptionalString(payload.profession),
    topMedicalSpecialties: readArrayField(payload, 'topMedicalSpecialties'),
    otherMedicalSpecialties: readArrayField(payload, 'otherMedicalSpecialties'),
    subSpecialties: readArrayField(payload, 'subSpecialties'),
    specialInterests: readArrayField(payload, 'specialInterests'),
    topTreatments: readArrayField(payload, 'topTreatments'),
    practiceIntroduction: parseOptionalString(payload.practiceIntroduction),
    uniqueToCompetitors: parseOptionalString(payload.uniqueToCompetitors),
    addressLine1: parseOptionalString(payload.addressLine1),
    addressLine2: parseOptionalString(payload.addressLine2),
    cityState: parseOptionalString(payload.cityState),
    postCode: parseOptionalString(payload.postCode),
    visibleArea: parseOptionalString(payload.visibleArea),
    practiceHours: parsePracticeHours(payload),
    gbpLink: parseOptionalUrl(payload.gbpLink, 'gbpLink'),
    facebook: parseOptionalUrl(payload.facebook, 'facebook'),
    instagram: parseOptionalUrl(payload.instagram, 'instagram'),
    linkedin: parseOptionalUrl(payload.linkedin, 'linkedin'),
    websiteLoginLink: parseOptionalUrl(payload.websiteLoginLink, 'websiteLoginLink'),
    websiteUsername: parseOptionalString(payload.websiteUsername),
    websitePassword: parseOptionalString(payload.websitePassword),
    googleAnalytics: parseOptionalString(payload.googleAnalytics),
    googleSearchConsole: parseOptionalString(payload.googleSearchConsole),
    treatmentAndServices: readArrayField(payload, 'treatmentAndServices'),
    conditionsTreated: readArrayField(payload, 'conditionsTreated'),
    status: parseClientStatus(payload.status, 'status', undefined),
    assignedTo: parseOptionalUserId(
      assignedToRaw,
      payload.assignedToId !== undefined ? 'assignedToId' : 'assignedTo'
    )
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete patch[key];
    }
  }

  const filesByField = {};
  for (const file of files || []) {
    const field = normalizeUploadFieldName(file.fieldname);
    const mappedColumn = FILE_COLUMN_MAP[field];
    if (!mappedColumn) continue;
    const relativePath = String(file.path || '').replace(/\\/g, '/').split('/public/')[1];
    if (!relativePath) continue;
    if (!filesByField[mappedColumn]) filesByField[mappedColumn] = [];
    filesByField[mappedColumn].push(`/${relativePath}`);
  }

  for (const [field, paths] of Object.entries(filesByField)) {
    const existing = Array.isArray(existingClient?.[field]) ? existingClient[field] : [];
    patch[field] = [...new Set([...existing, ...paths])];
  }

  return patch;
}

async function createClient({ db, actorUserId, payload }) {
  const clientName = String(payload.clientName || '').trim();
  const businessName = String(payload.businessName || '').trim();
  const niche = String(payload.niche || '').trim();
  const personalEmail = String(payload.personalEmail || '').trim().toLowerCase();
  const practiceEmail = String(payload.practiceEmail || '').trim().toLowerCase();
  const businessPhone = String(payload.businessPhone || '').trim();
  const country = String(payload.country || '').trim();
  const website = parseWebsite(payload.website);
  const status = parseClientStatus(payload.status, 'status', 'ACTIVE');
  const assignedToRaw = payload.assignedTo !== undefined ? payload.assignedTo : payload.assignedToId;
  const assignedTo = parseOptionalUserId(
    assignedToRaw,
    payload.assignedToId !== undefined ? 'assignedToId' : 'assignedTo'
  );

  if (
    !clientName
    || !businessName
    || !niche
    || !personalEmail
    || !practiceEmail
    || !businessPhone
    || !country
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'All required client fields must be provided.');
  }

  if (!EMAIL_REGEX.test(personalEmail) || !EMAIL_REGEX.test(practiceEmail)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'personalEmail and practiceEmail must be valid emails.');
  }

  let created;
  try {
    created = await db.client.create({
      data: {
        clientName,
        businessName,
        niche,
        personalEmail,
        practiceEmail,
        businessPhone,
        website,
        country,
        status,
        assignedTo,
        createdBy: BigInt(actorUserId)
      },
      include: ASSIGNED_USER_INCLUDE
    });
  } catch (err) {
    if (err.code === 'P2003') {
      throw new AppError(400, 'VALIDATION_ERROR', 'assignedTo does not reference an existing user.');
    }
    throw err;
  }

  return mapClient(created);
}

async function listClients({ db }) {
  const clients = await db.client.findMany({
    include: {
      ...ASSIGNED_USER_INCLUDE,
      projects: CLIENT_LIST_PROJECT_INCLUDE
    },
    orderBy: { id: 'desc' }
  });

  return clients.map(mapClient);
}

async function getClientById({ db, clientId }) {
  const client = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    include: ASSIGNED_USER_INCLUDE
  });

  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  return mapClient(client);
}

async function getClientGbpDetails({ db, clientId }) {
  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });
  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const profile = await db.clientGbpProfile.findUnique({
    where: { clientId: BigInt(clientId) }
  });
  if (profile) {
    return mapClientGbpProfile(profile);
  }
  throw new AppError(404, 'NOT_FOUND', 'No saved GBP profile found for this client.');
}

async function listClientCitations({ db, clientId }) {
  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });

  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const citations = await db.clientCitation.findMany({
    where: { clientId: BigInt(clientId) },
    orderBy: { directoryName: 'asc' }
  });

  return citations.map(mapClientCitation);
}

async function updateClient({ db, clientId, payload, files }) {
  const existingClient = await db.client.findUnique({
    where: { id: BigInt(clientId) }
  });

  if (!existingClient) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const patch = buildClientPatch({ payload, files, existingClient });
  if (!Object.keys(patch).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported fields to update.');
  }

  let updated;
  try {
    updated = await db.client.update({
      where: { id: BigInt(clientId) },
      data: patch,
      include: ASSIGNED_USER_INCLUDE
    });
  } catch (err) {
    if (err.code === 'P2003') {
      throw new AppError(400, 'VALIDATION_ERROR', 'assignedTo does not reference an existing user.');
    }
    throw err;
  }

  return mapClient(updated);
}

async function createClientProject({ db, actorUserId, clientId, payload }) {
  const projectName = String(payload.project || '').trim();
  const phase = String(payload.phase || '').trim();
  const progress = String(payload.progress || '').trim();
  const clientSuccessManagerId = parseRequiredUserId(payload.clientSuccessManagerId, 'clientSuccessManagerId');
  const accountManagerId = parseRequiredUserId(payload.accountManagerId, 'accountManagerId');

  if (!projectName || !phase || !progress) {
    throw new AppError(400, 'VALIDATION_ERROR', 'project, phase and progress are required.');
  }

  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });
  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  let created;
  try {
    created = await db.clientProject.create({
      data: {
        clientId: BigInt(clientId),
        project: projectName,
        clientSuccessManagerId,
        accountManagerId,
        phase,
        progress,
        createdBy: BigInt(actorUserId)
      },
      include: PROJECT_INCLUDE
    });
  } catch (err) {
    if (err.code === 'P2003') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'clientSuccessManagerId/accountManagerId must reference existing users.'
      );
    }
    throw err;
  }

  return mapClientProject(created);
}

async function createClientCitation({ db, actorUserId, clientId, payload }) {
  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });
  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const directoryName = parseRequiredCitationDirectory(
    payload.directoryName !== undefined ? payload.directoryName : payload.directory
  );

  let created;
  try {
    created = await db.clientCitation.create({
      data: {
        clientId: BigInt(clientId),
        directoryName,
        status: parseCitationStatus(payload.status, 'status', 'NOT_SYNCED'),
        profileUrl: parseOptionalUrl(payload.profileUrl, 'profileUrl'),
        username: parseOptionalString(payload.username),
        password: parseOptionalString(payload.password),
        notes: parseOptionalString(payload.notes),
        createdBy: actorUserId ? BigInt(actorUserId) : null
      }
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'Citation already exists for this directory.');
    }
    throw err;
  }

  return mapClientCitation(created);
}

async function updateClientCitation({ db, clientId, citationId, payload }) {
  const existingCitation = await db.clientCitation.findFirst({
    where: {
      id: BigInt(citationId),
      clientId: BigInt(clientId)
    }
  });

  if (!existingCitation) {
    throw new AppError(404, 'NOT_FOUND', 'Citation not found for this client.');
  }

  const patch = {
    directoryName:
      payload.directoryName !== undefined || payload.directory !== undefined
        ? parseRequiredCitationDirectory(
            payload.directoryName !== undefined ? payload.directoryName : payload.directory
          )
        : undefined,
    status: parseCitationStatus(payload.status, 'status', undefined),
    profileUrl: parseOptionalUrl(payload.profileUrl, 'profileUrl'),
    username: parseOptionalString(payload.username),
    password: parseOptionalString(payload.password),
    notes: parseOptionalString(payload.notes)
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete patch[key];
    }
  }

  if (!Object.keys(patch).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported citation fields to update.');
  }

  let updated;
  try {
    updated = await db.clientCitation.update({
      where: { id: BigInt(citationId) },
      data: patch
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'Citation already exists for this directory.');
    }
    throw err;
  }

  return mapClientCitation(updated);
}

async function deleteClientCitation({ db, clientId, citationId }) {
  const existingCitation = await db.clientCitation.findFirst({
    where: {
      id: BigInt(citationId),
      clientId: BigInt(clientId)
    },
    select: { id: true }
  });

  if (!existingCitation) {
    throw new AppError(404, 'NOT_FOUND', 'Citation not found for this client.');
  }

  await db.clientCitation.delete({
    where: { id: BigInt(citationId) }
  });

  return { deleted: true, id: citationId };
}

async function listClientProjects({ db, clientId, page = 1, limit = 20 }) {
  const projectsPage = Number(page);
  const projectsLimit = Number(limit);

  if (!Number.isInteger(projectsPage) || projectsPage <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(projectsLimit) || projectsLimit <= 0 || projectsLimit > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100.');
  }

  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });
  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const where = { clientId: BigInt(clientId) };
  const skip = (projectsPage - 1) * projectsLimit;
  const [total, projects] = await Promise.all([
    db.clientProject.count({ where }),
    db.clientProject.findMany({
      where,
      include: PROJECT_INCLUDE,
      orderBy: { id: 'desc' },
      skip,
      take: projectsLimit
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / projectsLimit));
  const hasPrev = projectsPage > 1;
  const hasNext = projectsPage < totalPages;

  return {
    projects: projects.map(mapClientProject),
    pagination: {
      page: projectsPage,
      limit: projectsLimit,
      total,
      totalPages,
      hasPrev,
      hasNext,
      prevPage: hasPrev ? projectsPage - 1 : null,
      nextPage: hasNext ? projectsPage + 1 : null
    }
  };
}

module.exports = {
  createClient,
  listClients,
  getClientById,
  getClientGbpDetails,
  listClientCitations,
  updateClient,
  createClientCitation,
  updateClientCitation,
  deleteClientCitation,
  createClientProject,
  listClientProjects
};
