-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "dices" SET DEFAULT '';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';
