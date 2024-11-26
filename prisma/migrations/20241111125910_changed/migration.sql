/*
  Warnings:

  - Made the column `turnEnds` on table `Game` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "turnEnds" SET NOT NULL,
ALTER COLUMN "turnEnds" SET DATA TYPE TEXT;
