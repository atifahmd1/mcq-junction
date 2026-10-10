-- CreateTable
CREATE TABLE "database_test" (
    "id" SERIAL NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "database_test_pkey" PRIMARY KEY ("id")
);
