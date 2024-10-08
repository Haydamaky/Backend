-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailConfirmationToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "isEmailConfirmed" BOOLEAN NOT NULL DEFAULT false;
