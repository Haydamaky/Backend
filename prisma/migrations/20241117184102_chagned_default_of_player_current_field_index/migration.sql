/*
  Warnings:

  - Made the column `currentFieldIndex` on table `Player` required. This step will fail if there are existing NULL values in that column.
  - Made the column `ownedFields` on table `Player` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "currentFieldIndex" SET NOT NULL,
ALTER COLUMN "currentFieldIndex" SET DEFAULT 1,
ALTER COLUMN "ownedFields" SET NOT NULL,
ALTER COLUMN "ownedFields" SET DEFAULT '[]';
