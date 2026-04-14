#!/usr/bin/env node

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

function parseArgs(argv) {
  return {
    force: argv.includes("--force"),
    truncate: argv.includes("--truncate"),
  };
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  const { force, truncate } = parseArgs(process.argv.slice(2));
  const sourceUrl = requireEnv("SOURCE_DATABASE_URL");
  const destinationUrl = requireEnv("DATABASE_URL");

  if (!force && sourceUrl === destinationUrl) {
    throw new Error(
      "SOURCE_DATABASE_URL and DATABASE_URL are the same. Aborting. Use --force only if intentional.",
    );
  }

  const sourceDb = new PrismaClient({
    datasources: {
      db: {
        url: sourceUrl,
      },
    },
  });

  const destinationDb = new PrismaClient({
    datasources: {
      db: {
        url: destinationUrl,
      },
    },
  });

  try {
    const [sourceLocations, sourceLanguages] = await Promise.all([
      sourceDb.dataForSeoGoogleAdsLocation.findMany({
        select: {
          locationCode: true,
          locationName: true,
          locationCodeParent: true,
          countryIsoCode: true,
          locationType: true,
          rawData: true,
        },
        orderBy: {
          locationCode: "asc",
        },
      }),
      sourceDb.dataForSeoGoogleAdsLanguage.findMany({
        select: {
          languageCode: true,
          languageName: true,
          rawData: true,
        },
        orderBy: {
          languageCode: "asc",
        },
      }),
    ]);

    if (!sourceLocations.length && !sourceLanguages.length) {
      console.log("No reference rows found in source database. Nothing to copy.");
      return;
    }

    await destinationDb.$transaction(async (tx) => {
      if (truncate) {
        await tx.dataForSeoGoogleAdsLocation.deleteMany({});
        await tx.dataForSeoGoogleAdsLanguage.deleteMany({});
      }

      for (const row of sourceLocations) {
        await tx.dataForSeoGoogleAdsLocation.upsert({
          where: { locationCode: row.locationCode },
          create: {
            locationCode: row.locationCode,
            locationName: row.locationName,
            locationCodeParent: row.locationCodeParent,
            countryIsoCode: row.countryIsoCode,
            locationType: row.locationType,
            rawData: row.rawData,
          },
          update: {
            locationName: row.locationName,
            locationCodeParent: row.locationCodeParent,
            countryIsoCode: row.countryIsoCode,
            locationType: row.locationType,
            rawData: row.rawData,
          },
        });
      }

      for (const row of sourceLanguages) {
        await tx.dataForSeoGoogleAdsLanguage.upsert({
          where: { languageCode: row.languageCode },
          create: {
            languageCode: row.languageCode,
            languageName: row.languageName,
            rawData: row.rawData,
          },
          update: {
            languageName: row.languageName,
            rawData: row.rawData,
          },
        });
      }
    });

    const [destLocationCount, destLanguageCount] = await Promise.all([
      destinationDb.dataForSeoGoogleAdsLocation.count(),
      destinationDb.dataForSeoGoogleAdsLanguage.count(),
    ]);

    console.log("DataForSEO Google Ads reference sync completed.");
    console.log(`Copied locations: ${sourceLocations.length}`);
    console.log(`Copied languages: ${sourceLanguages.length}`);
    console.log(`Destination totals -> locations: ${destLocationCount}, languages: ${destLanguageCount}`);
  } finally {
    await Promise.allSettled([sourceDb.$disconnect(), destinationDb.$disconnect()]);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
