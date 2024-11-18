/*
  Warnings:

  - You are about to drop the column `allFields` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `ownedFields` on the `Player` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Player" DROP COLUMN "allFields",
DROP COLUMN "ownedFields",
ADD COLUMN     "color" TEXT,
ADD COLUMN     "customFields" JSONB;
