-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'LOST');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "status" "PlayerStatus" NOT NULL DEFAULT 'ONLINE',
ALTER COLUMN "money" SET DEFAULT 25000;
