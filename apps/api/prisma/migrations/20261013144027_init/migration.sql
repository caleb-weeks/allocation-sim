-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'FUNDER', 'RECOMMENDER', 'OBSERVER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "title" TEXT NOT NULL,
    "valueUnit" TEXT NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "assumptions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "displayName" TEXT NOT NULL,
    "budget" INTEGER,
    "lens" TEXT,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cap" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curve" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "recommenderId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Curve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trust" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "recommenderId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Trust_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_key_key" ON "Round"("key");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_roundId_userId_key" ON "Membership"("roundId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_roundId_key_key" ON "Application"("roundId", "key");

-- CreateIndex
CREATE INDEX "Curve_roundId_idx" ON "Curve"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "Curve_recommenderId_applicationId_key" ON "Curve"("recommenderId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Trust_funderId_recommenderId_key" ON "Trust"("funderId", "recommenderId");

-- CreateIndex
CREATE INDEX "Snapshot_roundId_idx" ON "Snapshot"("roundId");

-- CreateIndex
CREATE INDEX "AuditEvent_roundId_createdAt_idx" ON "AuditEvent"("roundId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curve" ADD CONSTRAINT "Curve_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curve" ADD CONSTRAINT "Curve_recommenderId_fkey" FOREIGN KEY ("recommenderId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curve" ADD CONSTRAINT "Curve_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trust" ADD CONSTRAINT "Trust_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trust" ADD CONSTRAINT "Trust_recommenderId_fkey" FOREIGN KEY ("recommenderId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written integrity rules (Prisma can't express these in the schema).
-- The API validates the same rules first; these make bad data impossible even
-- for code paths that skip the API.
-- ---------------------------------------------------------------------------

-- A curve is a non-empty JSON array of {x, m} points: first x is 0, x strictly
-- increasing, m non-negative and non-increasing, at most 50 points.
CREATE FUNCTION curve_points_valid(points jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  n int;
  prev_x double precision;
  prev_m double precision;
  p jsonb;
  x double precision;
  m double precision;
BEGIN
  IF jsonb_typeof(points) <> 'array' THEN RETURN false; END IF;
  n := jsonb_array_length(points);
  IF n = 0 OR n > 50 THEN RETURN false; END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(points) LOOP
    IF jsonb_typeof(p->'x') <> 'number' OR jsonb_typeof(p->'m') <> 'number' THEN RETURN false; END IF;
    x := (p->>'x')::double precision;
    m := (p->>'m')::double precision;
    IF m < 0 THEN RETURN false; END IF;
    IF prev_x IS NULL THEN
      IF x <> 0 THEN RETURN false; END IF;
    ELSIF x <= prev_x OR m > prev_m THEN
      RETURN false;
    END IF;
    prev_x := x;
    prev_m := m;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE "Curve" ADD CONSTRAINT "Curve_points_valid" CHECK (curve_points_valid("points"::jsonb));
ALTER TABLE "Curve" ADD CONSTRAINT "Curve_version_positive" CHECK ("version" >= 1);
ALTER TABLE "Application" ADD CONSTRAINT "Application_cap_positive" CHECK ("cap" > 0);
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_budget_non_negative" CHECK ("budget" IS NULL OR "budget" >= 0);
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_budget_only_for_funders" CHECK ("budget" IS NULL OR "role" = 'FUNDER');
ALTER TABLE "Trust" ADD CONSTRAINT "Trust_weight_range" CHECK ("weight" >= 0 AND "weight" <= 100);
