/*
  Warnings:

  - A unique constraint covering the columns `[userId,gameId]` on the table `Player` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_gameId_key" ON "Player"("userId", "gameId");
