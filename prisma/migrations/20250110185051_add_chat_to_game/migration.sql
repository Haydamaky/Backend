/*
  Warnings:

  - A unique constraint covering the columns `[gameId]` on the table `Chat` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "gameId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Chat_gameId_key" ON "Chat"("gameId");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
