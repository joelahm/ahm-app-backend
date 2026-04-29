const { AppError } = require('../../lib/errors');
const integrationsService = require('../integrations/integrations.service');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRACTICE_HOURS_KEY_REGEX = /^practiceHours\[(\d+)\]\[(.+)\]$/;
const FILE_COLUMN_MAP = {
  highQualityHeadshot: 'highQualityHeadshot',
  yourCv: 'yourCv',
  practiceLocationInteriorPhoto: 'practiceLocationInteriorPhoto',
  practiceLocationExteriorPhoto: 'practiceLocationExteriorPhoto',
  otherImages: 'otherImages',
  colorGuide: 'colorGuide',
  logo: 'logo'
};
const ALLOWED_CLIENT_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'DELETED']);
const ALLOWED_CITATION_STATUSES = new Set(['COMPLETE', 'PENDING', 'INCOMPLETE', 'MISSING', 'ERROR']);
const ALLOWED_CITATION_VERIFICATION_STATUSES = new Set(['MATCH', 'INCORRECT', 'NOT_SYNCED']);
const CITATION_VERIFICATION_FIELDS = ['businessName', 'address', 'phone', 'zipCode'];
const GBP_POSTING_PROMPT_TYPES = {
  update: 'GBP Update',
  offer: 'GBP Offer',
  event: 'GBP Event'
};
const GBP_POSTING_VARIATION_ANGLES = [
  'educational and helpful',
  'benefit-led and reassuring',
  'question-led and conversational',
  'timely news/update focused',
  'trust and expertise focused',
  'action-oriented with a clear next step',
  'community/local relevance focused',
  'problem-solution focused'
];
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

  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (!normalized) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be ACTIVE, INACTIVE, or DELETED.`);
  }

  if (!ALLOWED_CLIENT_STATUSES.has(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be ACTIVE, INACTIVE, or DELETED.`);
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
    : client.assignedTo
      ? {
          id: Number(client.assignedTo),
          firstName: null,
          lastName: null,
          avatar: null
        }
      : null;

  return {
    id: Number(client.id),
    clientName: client.clientName,
    businessName: client.businessName,
    niche: client.niche,
    personalEmail: client.personalEmail,
    personalPhone: client.personalPhone ?? null,
    practiceEmail: client.practiceEmail,
    businessPhone: client.businessPhone,
    website: client.website,
    country: client.country,
    typeOfPractice: client.typeOfPractice ?? null,
    profession: client.profession ?? null,
    practiceStructure: client.practiceStructure ?? null,
    gmcRegistrationNumber: client.gmcRegistrationNumber ?? null,
    topMedicalSpecialties: toJsonArray(client.topMedicalSpecialties),
    otherMedicalSpecialties: toJsonArray(client.otherMedicalSpecialties),
    subSpecialties: toJsonArray(client.subSpecialties),
    specialInterests: toJsonArray(client.specialInterests),
    topTreatments: toJsonArray(client.topTreatments),
    practiceIntroduction: client.practiceIntroduction ?? null,
    uniqueToCompetitors: client.uniqueToCompetitors ?? null,
    credentials: client.credentials ?? null,
    majorAccomplishments: client.majorAccomplishments ?? null,
    highQualityHeadshot: toJsonArray(client.highQualityHeadshot),
    yourCv: toJsonArray(client.yourCv),
    practiceLocationInteriorPhoto: toJsonArray(client.practiceLocationInteriorPhoto),
    practiceLocationExteriorPhoto: toJsonArray(client.practiceLocationExteriorPhoto),
    otherImages: toJsonArray(client.otherImages),
    buildingName: client.buildingName ?? null,
    unitNumber: client.unitNumber ?? null,
    streetAddress: client.streetAddress ?? null,
    region: client.region ?? null,
    addressLine1: client.addressLine1 ?? null,
    addressLine2: client.addressLine2 ?? null,
    cityState: client.cityState ?? null,
    postCode: client.postCode ?? null,
    visibleArea: client.visibleArea ?? null,
    nearbyAreasServed: client.nearbyAreasServed ?? null,
    practiceHours: toJsonArray(client.practiceHours),
    gbpLink: client.gbpLink ?? null,
    discordChannel: client.discordChannel ?? null,
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
    projects: projects.map((project) => String(project.project || '').trim()).filter(Boolean),
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
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  switch (normalized) {
    case 'COMPLETE':
    case 'LIVE_CITATION':
      return 'Complete';
    case 'PENDING':
    case 'NOT_SYNCED':
    case 'IN_REVIEW':
      return 'Pending';
    case 'INCOMPLETE':
    case 'REJECTED':
      return 'Incomplete';
    case 'MISSING':
      return 'Missing';
    case 'ERROR':
      return 'Error';
    default:
      return 'Pending';
  }
}

function formatCitationVerificationStatus(status) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  switch (normalized) {
    case 'MATCH':
      return 'Match';
    case 'INCORRECT':
      return 'Incorrect';
    case 'NOT_SYNCED':
    default:
      return 'Not Synced';
  }
}

function formatCitationVerificationStatusMap(value) {
  const source = typeof value === 'object' && value !== null ? value : {};
  return CITATION_VERIFICATION_FIELDS.reduce((result, field) => {
    result[field] = formatCitationVerificationStatus(source[field]);
    return result;
  }, {});
}

function normalizeCitationDirectoryName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function mapClientCitation(citation) {
  return {
    id: Number(citation.id),
    clientId: Number(citation.clientId),
    citationDatabaseEntryId: citation.citationDatabaseEntryId ?? null,
    directoryName: citation.citationDatabaseEntry?.name ?? citation.directoryName,
    source: citation.citationDatabaseEntryId ? 'Database' : 'Custom',
    status: formatCitationStatus(citation.status),
    profileUrl: citation.profileUrl ?? null,
    username: citation.username ?? null,
    password: citation.password ?? null,
    notes: citation.notes ?? null,
    verificationStatus: formatCitationVerificationStatusMap(citation.verificationStatus),
    type: citation.citationDatabaseEntry?.type ?? null,
    createdBy: citation.createdBy ? Number(citation.createdBy) : null,
    createdAt: citation.createdAt,
    updatedAt: citation.updatedAt
  };
}

async function backfillClientCitationTemplateLinks({ db, clientId }) {
  const [templates, citations] = await Promise.all([
    db.citationDatabaseEntry.findMany({
      where: { status: 'Published' },
      select: { id: true, name: true }
    }),
    db.clientCitation.findMany({
      where: {
        clientId: BigInt(clientId),
        citationDatabaseEntryId: null
      },
      select: { id: true, directoryName: true }
    })
  ]);

  if (!templates.length || !citations.length) {
    return;
  }

  const templateMap = new Map(templates.map((template) => [normalizeCitationDirectoryName(template.name), template.id]));

  for (const citation of citations) {
    const templateId = templateMap.get(normalizeCitationDirectoryName(citation.directoryName));

    if (!templateId) {
      continue;
    }

    await db.clientCitation.update({
      where: { id: citation.id },
      data: { citationDatabaseEntryId: templateId }
    });
  }
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
    startDate: project.startDate ?? null,
    dueDate: project.dueDate ?? null,
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
  const coordinates =
    profile.gpsCoordinates ?? profile.rawSnapshot?.place_results?.gps_coordinates ?? profile.rawSnapshot?.local_results?.[0]?.gps_coordinates ?? null;

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

function mapClientReviewReplyDraft(draft) {
  return {
    id: Number(draft.id),
    clientId: Number(draft.clientId),
    reviewId: draft.reviewId,
    reviewerName: draft.reviewerName ?? null,
    rating: draft.rating ?? null,
    reviewText: draft.reviewText ?? null,
    replyText: draft.replyText,
    status: draft.status,
    createdBy: draft.createdBy ? Number(draft.createdBy) : null,
    updatedBy: draft.updatedBy ? Number(draft.updatedBy) : null,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt
  };
}

function mapClientGbpPosting(posting) {
  const creator = posting.creator || null;
  const assignee = posting.assignee || null;
  const creatorName = creator
    ? [creator.firstName, creator.lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ') || null
    : null;
  const assigneeName = assignee
    ? [assignee.firstName, assignee.lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ') || null
    : null;

  return {
    id: Number(posting.id),
    clientId: Number(posting.clientId),
    keyword: posting.keyword,
    audience: posting.audience ?? null,
    languageCode: posting.languageCode,
    language: posting.language,
    contentType: posting.contentType,
    buttonType: posting.buttonType ?? null,
    assigneeId: posting.assigneeId ? Number(posting.assigneeId) : null,
    assignee: assignee
      ? {
          id: Number(assignee.id),
          name: assigneeName || assignee.email || null,
          email: assignee.email ?? null,
          avatar: assignee.avatarUrl ?? null
        }
      : null,
    description: posting.description ?? null,
    postContent: posting.postContent ?? null,
    images: Array.isArray(posting.images) ? posting.images : [],
    liveLink: posting.liveLink ?? null,
    status: posting.status,
    scheduledAt: posting.scheduledAt ?? null,
    publishedAt: posting.publishedAt ?? null,
    createdBy: posting.createdBy ? Number(posting.createdBy) : null,
    creator: creator
      ? {
          id: Number(creator.id),
          name: creatorName || creator.email || null,
          email: creator.email ?? null,
          avatar: creator.avatarUrl ?? null
        }
      : null,
    createdAt: posting.createdAt,
    updatedAt: posting.updatedAt
  };
}

function mapClientGbpPostingComment(comment) {
  const author = comment.creator || null;
  return {
    id: Number(comment.id),
    postingId: Number(comment.postingId),
    comment: comment.comment,
    createdBy: comment.createdBy ? Number(comment.createdBy) : null,
    author: author
      ? {
          id: Number(author.id),
          firstName: author.firstName ?? null,
          lastName: author.lastName ?? null,
          avatar: author.avatarUrl ?? null,
          email: author.email ?? null
        }
      : null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt
  };
}

function parseReviewId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reviewId is required.');
  }
  if (normalized.length > 255) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reviewId must be 255 characters or less.');
  }
  return normalized;
}

function parseReplyText(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', 'replyText is required.');
  }
  if (normalized.length > 1500) {
    throw new AppError(400, 'VALIDATION_ERROR', 'replyText must be 1500 characters or less.');
  }
  return normalized;
}

function parseOptionalReviewRating(value) {
  if (value === undefined || value === null || value === '') return null;
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError(400, 'VALIDATION_ERROR', 'rating must be an integer between 1 and 5.');
  }
  return rating;
}

function parseRequiredString(value, fieldName, maxLength = 255) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be ${maxLength} characters or less.`);
  }
  return normalized;
}

function parsePositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function parseOptionalBigIntId(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a positive integer.`);
  }
  return BigInt(parsed);
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
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
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

function stringifyJsonList(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          return String(item.name || item.label || item.title || item.value || '').trim();
        }
        return String(item || '').trim();
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    return Object.values(value)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return String(value || '').trim();
}

function stringifyPracticeHours(value) {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      const day = String(item.day || '').trim();
      if (!day) {
        return '';
      }

      if (!item.enabled) {
        return `${day}: Closed`;
      }

      const start = [item.startTime, item.startMeridiem]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ');
      const end = [item.endTime, item.endMeridiem]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ');

      return start && end ? `${day}: ${start} - ${end}` : `${day}: Open`;
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeTokenMap(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value ?? '')]));
}

function resolveAiPromptTemplate(template, values) {
  const normalizedValues = normalizeTokenMap(values);

  return String(template || '')
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, token) => normalizedValues[String(token).toLowerCase()] ?? '')
    .replace(/\[([A-Z0-9_]+)\]/g, (_, token) => normalizedValues[String(token).toLowerCase()] ?? '');
}

function normalizeGbpPostingContentType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (normalized === 'gbp update') return 'Update';
  if (normalized === 'gbp offer') return 'Offer';
  if (normalized === 'gbp event') return 'Event';
  if (normalized === 'update' || normalized === 'offer' || normalized === 'event') {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  throw new AppError(400, 'VALIDATION_ERROR', 'contentType must be Update, Offer, or Event.');
}

function getGbpPromptType(contentType) {
  const normalized = normalizeGbpPostingContentType(contentType);
  return GBP_POSTING_PROMPT_TYPES[normalized.toLowerCase()];
}

function buildGbpPostingPromptValues({ client, item, language, languageCode, postIndex, totalPosts }) {
  const address = [client.addressLine1, client.addressLine2, client.cityState, client.country].filter(Boolean).join(', ');
  const contentType = normalizeGbpPostingContentType(item.contentType);

  return {
    address,
    address_line_1: client.addressLine1 || '',
    address_line_2: client.addressLine2 || '',
    audience: item.audience || '',
    brand_name: client.businessName || '',
    business_name: client.businessName || '',
    business_phone: client.businessPhone || '',
    city_state: client.cityState || '',
    client_business_name: client.businessName || '',
    client_business_email: client.practiceEmail || '',
    client_business_phone: client.businessPhone || '',
    client_building_name: client.buildingName || '',
    client_city_state: client.cityState || '',
    client_conditions_treated: stringifyJsonList(client.conditionsTreated),
    client_country: client.country || '',
    client_credentials: client.credentials || '',
    client_discord_channel: client.discordChannel || '',
    client_facebook: client.facebook || '',
    client_gbp_link: client.gbpLink || '',
    client_gmc_registration_number: client.gmcRegistrationNumber || '',
    client_instagram: client.instagram || '',
    client_linkedin: client.linkedin || '',
    client_major_accomplishments: client.majorAccomplishments || '',
    client_name: client.clientName || '',
    client_nearby_areas_served: client.nearbyAreasServed || '',
    client_niche: client.niche || '',
    client_personal_email: client.personalEmail || '',
    client_personal_phone: client.personalPhone || '',
    client_post_code: client.postCode || '',
    client_practice_hours: stringifyPracticeHours(client.practiceHours),
    client_practice_introduction: client.practiceIntroduction || '',
    client_practice_structure: client.practiceStructure || '',
    client_profession: client.profession || '',
    client_region: client.region || '',
    client_special_interests: stringifyJsonList(client.specialInterests),
    client_street_address: client.streetAddress || '',
    client_sub_specialty: stringifyJsonList(client.subSpecialties),
    client_sub_specialties: stringifyJsonList(client.subSpecialties),
    client_target_area: client.visibleArea || '',
    client_title: client.profession || '',
    client_top_medical_specialties: stringifyJsonList(client.topMedicalSpecialties),
    client_top_treatments: stringifyJsonList(client.topTreatments),
    client_treatment_and_services: stringifyJsonList(client.treatmentAndServices),
    client_type_of_practice: client.typeOfPractice || '',
    client_unique_to_competitors: client.uniqueToCompetitors || '',
    client_unit_number: client.unitNumber || '',
    client_visible_area: client.visibleArea || '',
    client_website: client.website || '',
    content_type: contentType,
    country: client.country || '',
    gbp_audience: item.audience || '',
    gbp_keyword: item.keyword,
    gbp_language: language,
    gbp_language_code: languageCode,
    gbp_number_of_posts: String(totalPosts),
    gbp_post_index: String(postIndex),
    gbp_post_type: contentType,
    keyword: item.keyword,
    location: client.cityState || client.country || '',
    niche: client.niche || '',
    post_code: client.postCode || '',
    practice_introduction: client.practiceIntroduction || '',
    profession: client.profession || '',
    url: client.website || '',
    website: client.website || ''
  };
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

  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (!normalized) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be COMPLETE, PENDING, INCOMPLETE, MISSING, or ERROR.`);
  }

  if (!ALLOWED_CITATION_STATUSES.has(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be COMPLETE, PENDING, INCOMPLETE, MISSING, or ERROR.`);
  }

  return normalized;
}

function parseCitationVerificationStatus(value, fieldName) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (!normalized) {
    return 'Not Synced';
  }

  if (!ALLOWED_CITATION_VERIFICATION_STATUSES.has(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be MATCH, INCORRECT, or NOT_SYNCED.`);
  }

  return formatCitationVerificationStatus(normalized);
}

function parseCitationVerificationStatusMap(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'verificationStatus must be an object.');
  }

  return CITATION_VERIFICATION_FIELDS.reduce((result, field) => {
    result[field] = parseCitationVerificationStatus(value[field], `verificationStatus.${field}`);
    return result;
  }, {});
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

function parseOptionalDate(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid date.`);
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
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
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
    personalPhone: parseOptionalString(payload.personalPhone),
    practiceEmail: parseOptionalEmail(payload.practiceEmail, 'practiceEmail'),
    businessPhone: parseOptionalString(payload.businessPhone),
    website: parseOptionalUrl(payload.website, 'website'),
    country: parseOptionalString(payload.country),
    typeOfPractice: parseOptionalString(payload.typeOfPractice),
    profession: parseOptionalString(payload.profession),
    practiceStructure: parseOptionalString(payload.practiceStructure),
    gmcRegistrationNumber: parseOptionalString(payload.gmcRegistrationNumber),
    topMedicalSpecialties: readArrayField(payload, 'topMedicalSpecialties'),
    otherMedicalSpecialties: readArrayField(payload, 'otherMedicalSpecialties'),
    subSpecialties: readArrayField(payload, 'subSpecialties'),
    specialInterests: readArrayField(payload, 'specialInterests'),
    topTreatments: readArrayField(payload, 'topTreatments'),
    practiceIntroduction: parseOptionalString(payload.practiceIntroduction),
    uniqueToCompetitors: parseOptionalString(payload.uniqueToCompetitors),
    credentials: parseOptionalString(payload.credentials),
    majorAccomplishments: parseOptionalString(payload.majorAccomplishments),
    buildingName: parseOptionalString(payload.buildingName),
    unitNumber: parseOptionalString(payload.unitNumber),
    streetAddress: parseOptionalString(payload.streetAddress),
    region: parseOptionalString(payload.region),
    addressLine1: parseOptionalString(payload.addressLine1),
    addressLine2: parseOptionalString(payload.addressLine2),
    cityState: parseOptionalString(payload.cityState),
    postCode: parseOptionalString(payload.postCode),
    visibleArea: parseOptionalString(payload.visibleArea),
    nearbyAreasServed: parseOptionalString(payload.nearbyAreasServed),
    practiceHours: parsePracticeHours(payload),
    gbpLink: parseOptionalUrl(payload.gbpLink, 'gbpLink'),
    discordChannel: parseOptionalString(payload.discordChannel),
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
    assignedTo: parseOptionalUserId(assignedToRaw, payload.assignedToId !== undefined ? 'assignedToId' : 'assignedTo')
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
    const relativePath = String(file.path || '')
      .replace(/\\/g, '/')
      .split('/public/')[1];
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
  const personalEmail = String(payload.personalEmail || '')
    .trim()
    .toLowerCase();
  const personalPhone = String(payload.personalPhone || '').trim();
  const practiceEmail = String(payload.practiceEmail || '')
    .trim()
    .toLowerCase();
  const businessPhone = String(payload.businessPhone || '').trim();
  const country = String(payload.country || '').trim() || 'United Kingdom';
  const website = parseWebsite(payload.website);
  const profession = String(payload.profession || '').trim();
  const status = parseClientStatus(payload.status, 'status', 'ACTIVE');
  const assignedToRaw = payload.assignedTo !== undefined ? payload.assignedTo : payload.assignedToId;
  const assignedTo = parseOptionalUserId(assignedToRaw, payload.assignedToId !== undefined ? 'assignedToId' : 'assignedTo');

  if (!clientName || !businessName || !niche || !personalEmail || !practiceEmail || !businessPhone) {
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
        personalPhone,
        practiceEmail,
        businessPhone,
        website,
        country,
        profession,
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

async function getClientGbpReviews({ db, env, clientId, requestedBy, query = {} }) {
  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });
  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const profile = await db.clientGbpProfile.findUnique({
    where: { clientId: BigInt(clientId) },
    select: { placeId: true, dataCid: true }
  });
  if (!profile?.placeId && !profile?.dataCid) {
    throw new AppError(404, 'NOT_FOUND', 'No saved GBP profile found for this client.');
  }

  const reviews = await integrationsService.fetchSerpApiReviews({
    db,
    env,
    requestedBy,
    payload: {
      clientId,
      placeId: profile.dataCid ? undefined : profile.placeId,
      dataId: profile.dataCid,
      hl: query.hl,
      nextPageToken: query.nextPageToken,
      sortBy: query.sortBy
    }
  });
  const drafts = await db.clientReviewReplyDraft.findMany({
    where: { clientId: BigInt(clientId) },
    orderBy: { updatedAt: 'desc' }
  });

  return {
    ...reviews,
    drafts: drafts.map(mapClientReviewReplyDraft),
    placeId: profile.placeId,
    dataCid: profile.dataCid
  };
}

async function saveClientReviewReplyDraft({ db, clientId, reviewId, actorUserId, payload }) {
  const normalizedReviewId = parseReviewId(reviewId);
  const replyText = parseReplyText(payload.replyText);
  const reviewerName = parseOptionalString(payload.reviewerName);
  const reviewText = parseOptionalString(payload.reviewText);
  const rating = parseOptionalReviewRating(payload.rating);

  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });
  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const draft = await db.clientReviewReplyDraft.upsert({
    where: {
      clientId_reviewId: {
        clientId: BigInt(clientId),
        reviewId: normalizedReviewId
      }
    },
    create: {
      clientId: BigInt(clientId),
      reviewId: normalizedReviewId,
      reviewerName,
      rating,
      reviewText,
      replyText,
      status: 'DRAFT',
      createdBy: actorUserId ? BigInt(actorUserId) : null,
      updatedBy: actorUserId ? BigInt(actorUserId) : null
    },
    update: {
      reviewerName,
      rating,
      reviewText,
      replyText,
      status: 'DRAFT',
      updatedBy: actorUserId ? BigInt(actorUserId) : null
    }
  });

  return mapClientReviewReplyDraft(draft);
}

async function listClientGbpPostings({ db, clientId }) {
  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });
  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const postings = await db.clientGbpPosting.findMany({
    where: { clientId: BigInt(clientId) },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true
        }
      },
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true
        }
      }
    },
    orderBy: { id: 'desc' }
  });

  return postings.map(mapClientGbpPosting);
}

async function createClientGbpPostings({ db, clientId, actorUserId, payload }) {
  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });
  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const audience = parseOptionalString(payload.audience);
  const languageCode = parseRequiredString(payload.languageCode || 'en', 'languageCode', 16);
  const language = parseRequiredString(payload.language || 'English', 'language', 120);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (!rawItems.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'items must include at least one posting item.');
  }

  const rows = rawItems.flatMap((item) => {
    const keyword = parseRequiredString(item.keyword, 'keyword');
    const contentType = parseRequiredString(item.contentType, 'contentType', 64);
    const numberOfPosts = parsePositiveInteger(item.numberOfPosts || 1, 'numberOfPosts');

    return Array.from({ length: numberOfPosts }, () => ({
      clientId: BigInt(clientId),
      keyword,
      audience,
      languageCode,
      language,
      contentType,
      description: `Audience: ${audience || '-'} · ${language}`,
      postContent: null,
      images: [],
      liveLink: null,
      status: 'Draft',
      createdBy: actorUserId ? BigInt(actorUserId) : null
    }));
  });

  await db.clientGbpPosting.createMany({
    data: rows
  });

  const postings = await db.clientGbpPosting.findMany({
    where: { clientId: BigInt(clientId) },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true
        }
      },
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true
        }
      }
    },
    orderBy: { id: 'desc' },
    take: rows.length
  });

  return postings.map(mapClientGbpPosting);
}

async function generateClientGbpPostings({ db, env, clientId, actorUserId, payload }) {
  const client = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: {
      id: true,
      clientName: true,
      businessName: true,
      niche: true,
      profession: true,
      typeOfPractice: true,
      practiceIntroduction: true,
      businessPhone: true,
      website: true,
      country: true,
      cityState: true,
      visibleArea: true,
      specialInterests: true,
      topTreatments: true,
      addressLine1: true,
      addressLine2: true,
      postCode: true
    }
  });
  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const audience = parseOptionalString(payload.audience);
  const languageCode = parseRequiredString(payload.languageCode || 'en', 'languageCode', 16);
  const language = parseRequiredString(payload.language || 'English', 'language', 120);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (!rawItems.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'items must include at least one posting item.');
  }

  const items = rawItems.map((item) => ({
    audience,
    contentType: normalizeGbpPostingContentType(item.contentType),
    keyword: parseRequiredString(item.keyword, 'keyword'),
    numberOfPosts: parsePositiveInteger(item.numberOfPosts || 1, 'numberOfPosts')
  }));
  const promptTypes = Array.from(new Set(items.map((item) => getGbpPromptType(item.contentType))));
  const prompts = await db.aiPrompt.findMany({
    where: {
      status: 'Active',
      typeOfPost: { in: promptTypes }
    },
    orderBy: { updatedAt: 'desc' }
  });
  const promptByType = promptTypes.reduce((acc, typeOfPost) => {
    const matching = prompts.filter((prompt) => prompt.typeOfPost === typeOfPost);
    acc[typeOfPost] = matching[0] || null;
    return acc;
  }, {});
  const missingPromptType = promptTypes.find((typeOfPost) => !promptByType[typeOfPost]?.prompt);
  if (missingPromptType) {
    throw new AppError(400, 'VALIDATION_ERROR', `No active AI prompt found for ${missingPromptType}.`);
  }

  const createdPostings = [];
  const generations = [];

  for (const item of items) {
    const promptType = getGbpPromptType(item.contentType);
    const promptRecord = promptByType[promptType];
    const generatedTextsForItem = [];

    for (let postIndex = 1; postIndex <= item.numberOfPosts; postIndex += 1) {
      const resolvedPrompt = resolveAiPromptTemplate(
        promptRecord.prompt,
        buildGbpPostingPromptValues({
          client,
          item,
          language,
          languageCode,
          postIndex,
          totalPosts: item.numberOfPosts
        })
      ).trim();

      if (!resolvedPrompt) {
        throw new AppError(400, 'VALIDATION_ERROR', `Resolved prompt is empty for ${promptType}.`);
      }

      const variationAngle = GBP_POSTING_VARIATION_ANGLES[(postIndex - 1) % GBP_POSTING_VARIATION_ANGLES.length];
      const previousOutputInstruction = generatedTextsForItem.length
        ? [
            'Previously generated posts for this same keyword. Do not repeat their opening line, sentence structure, CTA, or core wording:',
            ...generatedTextsForItem.map((text, index) => `${index + 1}. ${text.slice(0, 500)}`)
          ].join('\n')
        : '';
      const promptWithUniquenessInstruction = [
        resolvedPrompt,
        item.numberOfPosts > 1
          ? [
              `Variation ${postIndex} of ${item.numberOfPosts}.`,
              `Use this distinct angle: ${variationAngle}.`,
              'Create a genuinely different post for the same keyword.',
              'Use a different opening sentence, wording pattern, and call-to-action from the other variations.',
              previousOutputInstruction
            ]
              .filter(Boolean)
              .join('\n')
          : ''
      ]
        .filter(Boolean)
        .join('\n')
        .trim();

      const generated = await integrationsService.fetchManusGeneratedText({
        db,
        env,
        requestedBy: actorUserId,
        payload: {
          auditContext: {
            clientId: Number(client.id),
            feature: 'GBP_POSTINGS',
            keyword: item.keyword,
            promptId: promptRecord.id,
            promptType,
            resolvedPromptPreview: promptWithUniquenessInstruction.slice(0, 1200),
            postIndex,
            totalPosts: item.numberOfPosts
          },
          clientId,
          maxCharacters: Number(promptRecord.maxCharacter || 1500),
          prompt: promptWithUniquenessInstruction,
          provider: 'OPENAI'
        }
      });
      const generatedText = String(generated.text || '').trim();
      if (!generatedText) {
        throw new AppError(502, 'UPSTREAM_API_ERROR', `AI returned empty content for ${promptType}.`);
      }
      generatedTextsForItem.push(generatedText);

      const posting = await db.clientGbpPosting.create({
        data: {
          clientId: BigInt(clientId),
          keyword: item.keyword,
          audience,
          languageCode,
          language,
          contentType: item.contentType,
          description: generatedText,
          postContent: generatedText,
          images: [],
          liveLink: null,
          status: 'Draft',
          createdBy: actorUserId ? BigInt(actorUserId) : null
        },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true
            }
          },
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true
            }
          }
        }
      });

      createdPostings.push(mapClientGbpPosting(posting));
      generations.push({
        keyword: item.keyword,
        logId: generated.logId,
        postIndex,
        promptId: promptRecord.id,
        promptType,
        provider: generated.provider,
        taskId: generated.taskId ?? null
      });
    }
  }

  return {
    generations,
    postings: createdPostings,
    total: createdPostings.length
  };
}

async function generateClientGbpPostingContent({ db, env, clientId, postingId, actorUserId, payload }) {
  const [client, posting] = await Promise.all([
    db.client.findUnique({
      where: { id: BigInt(clientId) },
      select: {
        id: true,
        clientName: true,
        businessName: true,
        niche: true,
        profession: true,
        typeOfPractice: true,
        practiceIntroduction: true,
        businessPhone: true,
        website: true,
        country: true,
        cityState: true,
        visibleArea: true,
        specialInterests: true,
        topTreatments: true,
        addressLine1: true,
        addressLine2: true,
        postCode: true
      }
    }),
    db.clientGbpPosting.findFirst({
      where: {
        id: BigInt(postingId),
        clientId: BigInt(clientId)
      },
      select: {
        id: true,
        keyword: true,
        audience: true,
        languageCode: true,
        language: true,
        contentType: true
      }
    })
  ]);

  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }
  if (!posting) {
    throw new AppError(404, 'NOT_FOUND', 'GBP posting not found for this client.');
  }

  const contentType = normalizeGbpPostingContentType(payload.contentType || posting.contentType);
  const promptType = getGbpPromptType(contentType);
  const promptRecords = await db.aiPrompt.findMany({
    where: {
      status: 'Active',
      typeOfPost: promptType
    },
    orderBy: { updatedAt: 'desc' }
  });
  const promptRecord = promptRecords[0] || null;

  if (!promptRecord?.prompt) {
    throw new AppError(400, 'VALIDATION_ERROR', `No active AI prompt found for ${promptType}.`);
  }

  const item = {
    audience: parseOptionalString(payload.audience) ?? posting.audience ?? null,
    contentType,
    keyword: parseRequiredString(payload.keyword || posting.keyword, 'keyword'),
    numberOfPosts: 1
  };
  const languageCode = parseRequiredString(payload.languageCode || posting.languageCode || 'en', 'languageCode', 16);
  const language = parseRequiredString(payload.language || posting.language || 'English', 'language', 120);
  const resolvedPrompt = resolveAiPromptTemplate(
    promptRecord.prompt,
    buildGbpPostingPromptValues({
      client,
      item,
      language,
      languageCode,
      postIndex: 1,
      totalPosts: 1
    })
  ).trim();

  if (!resolvedPrompt) {
    throw new AppError(400, 'VALIDATION_ERROR', `Resolved prompt is empty for ${promptType}.`);
  }

  const generated = await integrationsService.fetchManusGeneratedText({
    db,
    env,
    requestedBy: actorUserId,
    payload: {
      auditContext: {
        clientId: Number(client.id),
        feature: 'GBP_POSTINGS_EDIT',
        keyword: item.keyword,
        postingId: Number(posting.id),
        promptId: promptRecord.id,
        promptType,
        resolvedPromptPreview: resolvedPrompt.slice(0, 1200)
      },
      clientId,
      maxCharacters: Number(promptRecord.maxCharacter || 1500),
      prompt: resolvedPrompt,
      provider: 'OPENAI'
    }
  });
  const content = String(generated.text || '').trim();

  if (!content) {
    throw new AppError(502, 'UPSTREAM_API_ERROR', `AI returned empty content for ${promptType}.`);
  }

  return {
    content,
    generation: {
      keyword: item.keyword,
      logId: generated.logId,
      postingId: Number(posting.id),
      promptId: promptRecord.id,
      promptType,
      provider: generated.provider,
      taskId: generated.taskId ?? null
    }
  };
}

async function updateClientGbpPosting({ db, clientId, postingId, payload }) {
  const existingPosting = await db.clientGbpPosting.findFirst({
    where: {
      id: BigInt(postingId),
      clientId: BigInt(clientId)
    },
    select: { id: true }
  });
  if (!existingPosting) {
    throw new AppError(404, 'NOT_FOUND', 'GBP posting not found for this client.');
  }

  const patch = {};
  if (payload.keyword !== undefined) patch.keyword = parseRequiredString(payload.keyword, 'keyword');
  if (payload.contentType !== undefined) patch.contentType = parseRequiredString(payload.contentType, 'contentType', 64);
  if (payload.buttonType !== undefined) patch.buttonType = parseOptionalString(payload.buttonType);
  if (payload.assigneeId !== undefined) patch.assigneeId = parseOptionalBigIntId(payload.assigneeId, 'assigneeId');
  if (payload.description !== undefined) patch.description = parseOptionalString(payload.description);
  if (payload.postContent !== undefined) patch.postContent = parseOptionalString(payload.postContent);
  if (payload.status !== undefined) patch.status = parseRequiredString(payload.status, 'status', 64);
  if (payload.liveLink !== undefined) patch.liveLink = parseOptionalString(payload.liveLink);
  if (payload.images !== undefined) {
    patch.images = Array.isArray(payload.images)
      ? payload.images.map((image) => String(image || '').trim()).filter(Boolean)
      : [];
  }

  if (!Object.keys(patch).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported GBP posting fields to update.');
  }

  const posting = await db.clientGbpPosting.update({
    where: { id: BigInt(postingId) },
    data: patch,
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true
        }
      },
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true
        }
      }
    }
  });

  return mapClientGbpPosting(posting);
}

async function deleteClientGbpPosting({ db, clientId, postingId }) {
  const posting = await db.clientGbpPosting.findFirst({
    where: {
      id: BigInt(postingId),
      clientId: BigInt(clientId)
    },
    select: { id: true }
  });

  if (!posting) {
    throw new AppError(404, 'NOT_FOUND', 'GBP posting not found for this client.');
  }

  await db.clientGbpPosting.delete({
    where: { id: BigInt(postingId) }
  });

  return { id: Number(posting.id) };
}

async function listClientGbpPostingComments({ db, clientId, postingId }) {
  const posting = await db.clientGbpPosting.findFirst({
    where: {
      id: BigInt(postingId),
      clientId: BigInt(clientId)
    },
    select: { id: true }
  });
  if (!posting) {
    throw new AppError(404, 'NOT_FOUND', 'GBP posting not found for this client.');
  }

  const comments = await db.clientGbpPostingComment.findMany({
    where: { postingId: BigInt(postingId) },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true
        }
      }
    },
    orderBy: { id: 'asc' }
  });

  return comments.map(mapClientGbpPostingComment);
}

async function createClientGbpPostingComment({ db, clientId, postingId, actorUserId, payload }) {
  const comment = String(payload.comment || '').trim();
  if (!comment) {
    throw new AppError(400, 'VALIDATION_ERROR', 'comment is required.');
  }
  const posting = await db.clientGbpPosting.findFirst({
    where: {
      id: BigInt(postingId),
      clientId: BigInt(clientId)
    },
    select: { id: true }
  });
  if (!posting) {
    throw new AppError(404, 'NOT_FOUND', 'GBP posting not found for this client.');
  }

  const created = await db.clientGbpPostingComment.create({
    data: {
      postingId: BigInt(postingId),
      comment,
      createdBy: actorUserId ? BigInt(actorUserId) : null
    },
    include: {
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true
        }
      }
    }
  });

  return mapClientGbpPostingComment(created);
}

async function deleteClientGbpPostingComment({ db, clientId, postingId, commentId, actorUserId }) {
  const comment = await db.clientGbpPostingComment.findFirst({
    where: {
      id: BigInt(commentId),
      postingId: BigInt(postingId),
      posting: {
        clientId: BigInt(clientId)
      }
    },
    select: { id: true, createdBy: true }
  });

  if (!comment) {
    throw new AppError(404, 'NOT_FOUND', 'GBP posting comment not found for this client.');
  }

  if (Number(comment.createdBy) !== Number(actorUserId)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only delete your own comment.');
  }

  await db.clientGbpPostingComment.delete({
    where: { id: BigInt(commentId) }
  });

  return { id: Number(comment.id) };
}

async function listClientCitations({ db, clientId }) {
  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });

  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  await backfillClientCitationTemplateLinks({ db, clientId });

  const citations = await db.clientCitation.findMany({
    where: { clientId: BigInt(clientId) },
    orderBy: { directoryName: 'asc' },
    include: {
      citationDatabaseEntry: {
        select: { id: true, name: true, type: true }
      }
    }
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

async function testClientDiscordConnection({ db, env, clientId, payload }) {
  const client = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: {
      businessName: true,
      clientName: true,
      discordChannel: true
    }
  });

  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const botToken = env?.integrations?.discord?.botToken;
  if (!botToken) {
    throw new AppError(
      500,
      'CONFIGURATION_ERROR',
      'Discord bot token is not configured.'
    );
  }

  const channelId = parseOptionalString(payload.discordChannel) || client.discordChannel;
  if (!channelId) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Discord channel is required before testing the connection.'
    );
  }

  if (!/^\d{15,25}$/.test(channelId)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Discord channel must be a valid channel ID.'
    );
  }

  const clientLabel = client.clientName || client.businessName || `Client ${clientId}`;
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${botToken}`
    }
  });

  if (!response.ok) {
    let details = null;
    try {
      details = await response.json();
    } catch {
      details = await response.text().catch(() => null);
    }

    throw new AppError(
      502,
      'UPSTREAM_API_ERROR',
      'Discord channel access test failed.',
      {
        provider: 'DISCORD',
        status: response.status,
        details
      }
    );
  }

  const channel = await response.json();

  return {
    channelId,
    channelName: channel?.name ?? null,
    reachable: true
  };
}

async function createClientProject({ db, actorUserId, clientId, payload }) {
  const projectName = String(payload.project || '').trim();
  const phase = String(payload.phase || '').trim();
  const progress = String(payload.progress || '').trim();
  const clientSuccessManagerId = parseRequiredUserId(payload.clientSuccessManagerId, 'clientSuccessManagerId');
  const accountManagerId = parseRequiredUserId(payload.accountManagerId, 'accountManagerId');
  const startDate = parseOptionalDate(payload.startDate, 'startDate');
  const dueDate = parseOptionalDate(payload.dueDate, 'dueDate');

  if (!projectName || !phase || !progress) {
    throw new AppError(400, 'VALIDATION_ERROR', 'project, phase and progress are required.');
  }
  if (startDate && dueDate && dueDate < startDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'dueDate must be on or after startDate.');
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
        startDate,
        dueDate,
        phase,
        progress,
        createdBy: BigInt(actorUserId)
      },
      include: PROJECT_INCLUDE
    });
  } catch (err) {
    if (err.code === 'P2003') {
      throw new AppError(400, 'VALIDATION_ERROR', 'clientSuccessManagerId/accountManagerId must reference existing users.');
    }
    throw err;
  }

  return mapClientProject(created);
}

async function updateClientProject({ db, clientId, projectId, payload }) {
  const existingProject = await db.clientProject.findFirst({
    where: {
      id: BigInt(projectId),
      clientId: BigInt(clientId)
    },
    include: PROJECT_INCLUDE
  });

  if (!existingProject) {
    throw new AppError(404, 'NOT_FOUND', 'Project not found for this client.');
  }

  const projectName = payload.project === undefined ? undefined : String(payload.project || '').trim();
  const phase = payload.phase === undefined ? undefined : String(payload.phase || '').trim();
  const progress = payload.progress === undefined ? undefined : String(payload.progress || '').trim();
  const clientSuccessManagerId =
    payload.clientSuccessManagerId === undefined ? undefined : parseOptionalUserId(payload.clientSuccessManagerId, 'clientSuccessManagerId');
  const accountManagerId = payload.accountManagerId === undefined ? undefined : parseOptionalUserId(payload.accountManagerId, 'accountManagerId');
  const startDate = parseOptionalDate(payload.startDate, 'startDate');
  const dueDate = parseOptionalDate(payload.dueDate, 'dueDate');

  const nextStartDate = startDate === undefined ? existingProject.startDate : startDate;
  const nextDueDate = dueDate === undefined ? existingProject.dueDate : dueDate;
  if (nextStartDate && nextDueDate && nextDueDate < nextStartDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'dueDate must be on or after startDate.');
  }

  const patch = {
    project: projectName,
    phase,
    progress,
    clientSuccessManagerId,
    accountManagerId,
    startDate,
    dueDate
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete patch[key];
    }
  }

  if (!Object.keys(patch).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported project fields to update.');
  }

  let updated;
  try {
    updated = await db.clientProject.update({
      where: { id: BigInt(projectId) },
      data: patch,
      include: PROJECT_INCLUDE
    });
  } catch (err) {
    if (err.code === 'P2003') {
      throw new AppError(400, 'VALIDATION_ERROR', 'clientSuccessManagerId/accountManagerId must reference existing users.');
    }
    throw err;
  }

  return mapClientProject(updated);
}

async function deleteClientProject({ db, clientId, projectId }) {
  const existingProject = await db.clientProject.findFirst({
    where: {
      id: BigInt(projectId),
      clientId: BigInt(clientId)
    },
    select: { id: true }
  });

  if (!existingProject) {
    throw new AppError(404, 'NOT_FOUND', 'Project not found for this client.');
  }

  await db.clientProject.delete({
    where: { id: BigInt(projectId) }
  });

  return { id: Number(existingProject.id) };
}

async function createClientCitation({ db, actorUserId, clientId, payload }) {
  const clientExists = await db.client.findUnique({
    where: { id: BigInt(clientId) },
    select: { id: true }
  });
  if (!clientExists) {
    throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  }

  const citationDatabaseEntryId = parseOptionalString(payload.citationDatabaseEntryId);
  let citationDatabaseEntry = null;

  if (citationDatabaseEntryId) {
    citationDatabaseEntry = await db.citationDatabaseEntry.findUnique({
      where: { id: citationDatabaseEntryId },
      select: { id: true, name: true, status: true, type: true }
    });

    if (!citationDatabaseEntry || citationDatabaseEntry.status !== 'Published') {
      throw new AppError(400, 'VALIDATION_ERROR', 'citationDatabaseEntryId must reference a published citation database entry.');
    }
  }

  const directoryName = parseRequiredCitationDirectory(
    citationDatabaseEntry?.name ?? (payload.directoryName !== undefined ? payload.directoryName : payload.directory)
  );

  if (citationDatabaseEntry?.id) {
    const existingLinkedCitation = await db.clientCitation.findFirst({
      where: {
        clientId: BigInt(clientId),
        citationDatabaseEntryId: citationDatabaseEntry.id
      },
      select: { id: true }
    });

    if (existingLinkedCitation) {
      throw new AppError(409, 'CONFLICT', 'Citation already exists for this database entry.');
    }
  }

  let created;
  try {
    created = await db.clientCitation.create({
      data: {
        clientId: BigInt(clientId),
        citationDatabaseEntryId: citationDatabaseEntry?.id ?? null,
        directoryName,
        status: parseCitationStatus(payload.status, 'status', 'PENDING'),
        profileUrl: parseOptionalUrl(payload.profileUrl, 'profileUrl'),
        username: parseOptionalString(payload.username),
        password: parseOptionalString(payload.password),
        notes: parseOptionalString(payload.notes),
        verificationStatus: parseCitationVerificationStatusMap(payload.verificationStatus),
        createdBy: actorUserId ? BigInt(actorUserId) : null
      },
      include: {
        citationDatabaseEntry: {
          select: { id: true, name: true, type: true }
        }
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

  let citationDatabaseEntry = undefined;
  if (payload.citationDatabaseEntryId !== undefined) {
    const citationDatabaseEntryId = parseOptionalString(payload.citationDatabaseEntryId);

    if (citationDatabaseEntryId === null) {
      citationDatabaseEntry = null;
    } else {
      citationDatabaseEntry = await db.citationDatabaseEntry.findUnique({
        where: { id: citationDatabaseEntryId },
        select: { id: true, name: true, status: true, type: true }
      });

      if (!citationDatabaseEntry || citationDatabaseEntry.status !== 'Published') {
        throw new AppError(400, 'VALIDATION_ERROR', 'citationDatabaseEntryId must reference a published citation database entry.');
      }
    }
  }

  const patch = {
    citationDatabaseEntryId: citationDatabaseEntry === undefined ? undefined : (citationDatabaseEntry?.id ?? null),
    directoryName:
      citationDatabaseEntry?.name !== undefined
        ? citationDatabaseEntry?.name
        : payload.directoryName !== undefined || payload.directory !== undefined
          ? parseRequiredCitationDirectory(payload.directoryName !== undefined ? payload.directoryName : payload.directory)
          : undefined,
    status: parseCitationStatus(payload.status, 'status', undefined),
    profileUrl: parseOptionalUrl(payload.profileUrl, 'profileUrl'),
    username: parseOptionalString(payload.username),
    password: parseOptionalString(payload.password),
    notes: parseOptionalString(payload.notes),
    verificationStatus: parseCitationVerificationStatusMap(payload.verificationStatus)
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete patch[key];
    }
  }

  if (!Object.keys(patch).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No supported citation fields to update.');
  }

  if (citationDatabaseEntry?.id) {
    const existingLinkedCitation = await db.clientCitation.findFirst({
      where: {
        clientId: BigInt(clientId),
        citationDatabaseEntryId: citationDatabaseEntry.id,
        id: { not: BigInt(citationId) }
      },
      select: { id: true }
    });

    if (existingLinkedCitation) {
      throw new AppError(409, 'CONFLICT', 'Citation already exists for this database entry.');
    }
  }

  let updated;
  try {
    updated = await db.clientCitation.update({
      where: { id: BigInt(citationId) },
      data: patch,
      include: {
        citationDatabaseEntry: {
          select: { id: true, name: true, type: true }
        }
      }
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
  getClientGbpReviews,
  saveClientReviewReplyDraft,
  listClientGbpPostings,
  createClientGbpPostings,
  generateClientGbpPostings,
  generateClientGbpPostingContent,
  updateClientGbpPosting,
  deleteClientGbpPosting,
  listClientGbpPostingComments,
  createClientGbpPostingComment,
  deleteClientGbpPostingComment,
  listClientCitations,
  updateClient,
  testClientDiscordConnection,
  createClientCitation,
  updateClientCitation,
  deleteClientCitation,
  createClientProject,
  updateClientProject,
  deleteClientProject,
  listClientProjects
};
