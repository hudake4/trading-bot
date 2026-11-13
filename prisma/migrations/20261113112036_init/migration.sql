-- CreateTable
CREATE TABLE "Settings" (
    "householdId" TEXT NOT NULL PRIMARY KEY DEFAULT 'local',
    "activeStrategyId" TEXT NOT NULL DEFAULT 'trend',
    "botEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "liveAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "positionBps" INTEGER NOT NULL DEFAULT 1000,
    "stopLossBps" INTEGER NOT NULL DEFAULT 500,
    "maxPositions" INTEGER NOT NULL DEFAULT 5,
    "entryDelayMinutes" INTEGER NOT NULL DEFAULT 5,
    "lastRunDate" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StrategyConfig" (
    "strategyId" TEXT NOT NULL PRIMARY KEY,
    "paramsJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WatchSymbol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL DEFAULT 'local',
    "symbol" TEXT NOT NULL,
    "strategyId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BotRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL DEFAULT 'local',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "trigger" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "message" TEXT,
    "equityCents" INTEGER
);

-- CreateTable
CREATE TABLE "BotDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "signal" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priceCents" INTEGER,
    "qty" INTEGER,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BotDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BotRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchSymbol_householdId_symbol_key" ON "WatchSymbol"("householdId", "symbol");

-- CreateIndex
CREATE INDEX "BotRun_householdId_startedAt_idx" ON "BotRun"("householdId", "startedAt");

-- CreateIndex
CREATE INDEX "BotDecision_runId_idx" ON "BotDecision"("runId");
