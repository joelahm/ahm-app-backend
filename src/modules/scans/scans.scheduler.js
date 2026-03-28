const scansService = require('./scans.service');

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 10;
const SCHEDULER_ACTOR_USER_ID = null;

function logInfo(message, details) {
  if (details) {
    // eslint-disable-next-line no-console
    console.info(`[scan-scheduler] ${message}`, details);
    return;
  }

  // eslint-disable-next-line no-console
  console.info(`[scan-scheduler] ${message}`);
}

function logError(message, error, details) {
  // eslint-disable-next-line no-console
  console.error(`[scan-scheduler] ${message}`, {
    code: error?.code || 'UNKNOWN_ERROR',
    message: error?.message || 'Unknown scheduler error.',
    ...details
  });
}

async function findDueRecurringScans({ db, limit }) {
  return db.scan.findMany({
    where: {
      recurrenceEnabled: true,
      status: 'ACTIVE',
      remainingRuns: { gt: 0 },
      nextRunAt: { lte: new Date() },
      runs: {
        none: {
          status: { in: ['PENDING', 'RUNNING'] }
        }
      }
    },
    select: {
      id: true,
      nextRunAt: true
    },
    orderBy: [
      { nextRunAt: 'asc' },
      { id: 'asc' }
    ],
    take: limit
  });
}

function startScanScheduler({ db, env, io }) {
  const schedulerEnabled = env?.scans?.schedulerEnabled !== false;
  const pollIntervalMs = env?.scans?.schedulerPollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
  const batchSize = env?.scans?.schedulerBatchSize || DEFAULT_BATCH_SIZE;

  let timeoutId = null;
  let stopped = false;
  let tickInProgress = false;

  const scheduleNextTick = (delayMs = pollIntervalMs) => {
    if (stopped) {
      return;
    }

    timeoutId = setTimeout(() => {
      void runTick();
    }, delayMs);
    timeoutId.unref?.();
  };

  const triggerScanRun = async (scanId) => {
    const run = await scansService.startScanRun({
      db,
      actorUserId: SCHEDULER_ACTOR_USER_ID,
      scanId
    });

    void scansService.executeScanRun({
      db,
      env,
      actorUserId: SCHEDULER_ACTOR_USER_ID,
      scanId,
      runId: run.id,
      io
    }).catch((error) => {
      logError('Scan execution failed after scheduler dispatch.', error, {
        scanId,
        runId: run.id
      });
    });

    return run;
  };

  const runTick = async () => {
    if (stopped || tickInProgress) {
      return;
    }

    tickInProgress = true;

    try {
      const dueScans = await findDueRecurringScans({
        db,
        limit: batchSize
      });

      for (const scan of dueScans) {
        const scanId = Number(scan.id);

        try {
          const run = await triggerScanRun(scanId);

          logInfo('Dispatched recurring scan run.', {
            scanId,
            runId: run.id,
            nextRunAt: scan.nextRunAt
          });
        } catch (error) {
          if (error?.statusCode === 409 || error?.code === 'CONFLICT') {
            continue;
          }

          logError('Failed to dispatch recurring scan.', error, { scanId });
        }
      }
    } catch (error) {
      logError('Scheduler tick failed.', error);
    } finally {
      tickInProgress = false;
      scheduleNextTick();
    }
  };

  if (!schedulerEnabled) {
    logInfo('Recurring scan scheduler is disabled.');

    return {
      start() {},
      stop() {
        stopped = true;
      }
    };
  }

  logInfo('Recurring scan scheduler started.', {
    pollIntervalMs,
    batchSize
  });

  scheduleNextTick(1_000);

  return {
    start() {
      if (stopped) {
        stopped = false;
        scheduleNextTick(1_000);
      }
    },
    stop() {
      stopped = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
}

module.exports = {
  startScanScheduler
};
