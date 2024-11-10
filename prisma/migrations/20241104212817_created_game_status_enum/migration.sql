/*
  Warnings:

  - You are about to drop the column `isStarted` on the `Game` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('LOBBY', 'ACTIVE', 'FINISHED');

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "isStarted",
ADD COLUMN     "status" "GameStatus" NOT NULL DEFAULT 'LOBBY';
