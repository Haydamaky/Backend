/*
  Warnings:

  - You are about to drop the `Field` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FieldTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GameField` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GameMoves` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Group` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Field" DROP CONSTRAINT "Field_gameId_fkey";

-- DropForeignKey
ALTER TABLE "Field" DROP CONSTRAINT "Field_groupId_fkey";

-- DropForeignKey
ALTER TABLE "FieldTransaction" DROP CONSTRAINT "FieldTransaction_gameId_fkey";

-- DropForeignKey
ALTER TABLE "FieldTransaction" DROP CONSTRAINT "FieldTransaction_playerId_fkey";

-- DropForeignKey
ALTER TABLE "FieldTransaction" DROP CONSTRAINT "FieldTransaction_transactionId_fkey";

-- DropForeignKey
ALTER TABLE "GameField" DROP CONSTRAINT "GameField_fieldId_fkey";

-- DropForeignKey
ALTER TABLE "GameField" DROP CONSTRAINT "GameField_gameId_fkey";

-- DropForeignKey
ALTER TABLE "GameField" DROP CONSTRAINT "GameField_playerId_fkey";

-- DropForeignKey
ALTER TABLE "GameMoves" DROP CONSTRAINT "GameMoves_gameId_fkey";

-- DropForeignKey
ALTER TABLE "GameMoves" DROP CONSTRAINT "GameMoves_playerId_fkey";

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "allFields" JSONB,
ADD COLUMN     "currentFieldIndex" INTEGER DEFAULT 0,
ADD COLUMN     "ownedFields" JSONB;

-- DropTable
DROP TABLE "Field";

-- DropTable
DROP TABLE "FieldTransaction";

-- DropTable
DROP TABLE "GameField";

-- DropTable
DROP TABLE "GameMoves";

-- DropTable
DROP TABLE "Group";
