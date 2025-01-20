/*
  Warnings:

  - You are about to drop the column `status` on the `Player` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Player" DROP COLUMN "status",
ADD COLUMN     "lost" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "PlayerStatus";
