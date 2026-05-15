#!/usr/bin/env node

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SETTINGS_KEY = 'notification_settings';
const EVENT_KEYS = ['PUBLIC_REVIEW_SAVED', 'PUBLIC_REVIEW_COMMENT_ADDED'];
const TARGET_TOGGLES = { inApp: true, email: true, discord: false };

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function main() {
  const existing = await prisma.appSetting.findUnique({
    where: { key: SETTINGS_KEY },
    select: { valueJson: true },
  });

  const storage = asObject(existing?.valueJson);
  const channels = asObject(storage.channels);
  const events = { ...asObject(storage.events) };

  let changed = false;

  for (const eventKey of EVENT_KEYS) {
    const previous = asObject(events[eventKey]);
    const next = { ...TARGET_TOGGLES };
    const isDifferent =
      previous.inApp !== next.inApp ||
      previous.email !== next.email ||
      previous.discord !== next.discord;

    if (isDifferent) {
      changed = true;
    }

    events[eventKey] = next;
  }

  const nextStorage = {
    channels,
    events,
  };

  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: {
      key: SETTINGS_KEY,
      valueJson: nextStorage,
    },
    update: {
      valueJson: nextStorage,
    },
  });

  if (changed) {
    console.log(
      `Backfilled public review notification toggles for: ${EVENT_KEYS.join(', ')}`,
    );
  } else {
    console.log(
      'Public review notification toggles were already correct. No changes needed.',
    );
  }
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
