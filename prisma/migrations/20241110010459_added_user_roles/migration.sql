/*
  Warnings:

  - The primary key for the `Field` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `fieldId` on the `Field` table. All the data in the column will be lost.
  - The primary key for the `FieldTransaction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `fieldTransactionId` on the `FieldTransaction` table. All the data in the column will be lost.
  - The primary key for the `Follow` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `followId` on the `Follow` table. All the data in the column will be lost.
  - The primary key for the `GameField` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `gameFieldId` on the `GameField` table. All the data in the column will be lost.
  - The primary key for the `GameMoves` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `gameMoveId` on the `GameMoves` table. All the data in the column will be lost.
  - The primary key for the `Group` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `groupId` on the `Group` table. All the data in the column will be lost.
  - The primary key for the `Transaction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `transactionId` on the `Transaction` table. All the data in the column will be lost.
  - Added the required column `gameId` to the `Field` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `FieldTransaction` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `id` was added to the `Follow` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `id` was added to the `GameField` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `playerId` to the `GameMoves` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `Group` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `playerId` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ROLE" AS ENUM ('USER', 'ADMIN');

-- DropForeignKey
ALTER TABLE "Field" DROP CONSTRAINT "Field_groupId_fkey";

-- DropForeignKey
ALTER TABLE "Field" DROP CONSTRAINT "Field_id_fkey";

-- DropForeignKey
ALTER TABLE "FieldTransaction" DROP CONSTRAINT "FieldTransaction_transactionId_fkey";

-- DropForeignKey
ALTER TABLE "GameField" DROP CONSTRAINT "GameField_fieldId_fkey";

-- DropForeignKey
ALTER TABLE "GameMoves" DROP CONSTRAINT "GameMoves_id_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_id_fkey";

-- AlterTable
ALTER TABLE "Field" DROP CONSTRAINT "Field_pkey",
DROP COLUMN "fieldId",
ADD COLUMN     "gameId" TEXT NOT NULL,
ADD CONSTRAINT "Field_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "FieldTransaction" DROP CONSTRAINT "FieldTransaction_pkey",
DROP COLUMN "fieldTransactionId",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "FieldTransaction_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Follow" DROP CONSTRAINT "Follow_pkey",
DROP COLUMN "followId",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "Follow_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "GameField" DROP CONSTRAINT "GameField_pkey",
DROP COLUMN "gameFieldId",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "GameField_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "GameMoves" DROP CONSTRAINT "GameMoves_pkey",
DROP COLUMN "gameMoveId",
ADD COLUMN     "playerId" TEXT NOT NULL,
ADD CONSTRAINT "GameMoves_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Group" DROP CONSTRAINT "Group_pkey",
DROP COLUMN "groupId",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "Group_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_pkey",
DROP COLUMN "transactionId",
ADD COLUMN     "playerId" TEXT NOT NULL,
ADD CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "ROLE" NOT NULL DEFAULT 'USER';

-- AddForeignKey
ALTER TABLE "GameMoves" ADD CONSTRAINT "GameMoves_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameField" ADD CONSTRAINT "GameField_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldTransaction" ADD CONSTRAINT "FieldTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
