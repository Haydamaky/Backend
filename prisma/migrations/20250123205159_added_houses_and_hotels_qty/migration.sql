/*
  Warnings:

  - You are about to drop the `Transaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('DEFAULT');

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_playerId_fkey";

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "hotelsQty" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "housesQty" INTEGER NOT NULL DEFAULT 32,
ADD COLUMN     "type" "GameType" NOT NULL DEFAULT 'DEFAULT',
ALTER COLUMN "timeOfTurn" SET DEFAULT 20000;

-- DropTable
DROP TABLE "Transaction";
