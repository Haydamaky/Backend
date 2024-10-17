/*
  Warnings:

  - The `status` column on the `Follow` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Follow" DROP COLUMN "status",
ADD COLUMN     "status" "FollowStatus" NOT NULL DEFAULT 'PENDING';
