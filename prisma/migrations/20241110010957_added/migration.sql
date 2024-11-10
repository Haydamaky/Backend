/*
  Warnings:

  - Made the column `timeOfTurn` on table `Game` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "timeOfTurn" SET NOT NULL,
ALTER COLUMN "timeOfTurn" SET DEFAULT 120;
