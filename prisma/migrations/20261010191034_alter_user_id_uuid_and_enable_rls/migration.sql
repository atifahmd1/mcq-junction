/*
  Warnings:

  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `users` table from TEXT to native UUID.
*/

-- 1. Alter users.id column to UUID and establish primary key
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "id",
ADD COLUMN "id" UUID NOT NULL,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- 2. Foreign Key referencing Supabase Auth users
ALTER TABLE "users"
ADD CONSTRAINT "fk_users_auth"
FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE "database_test" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for users table
CREATE POLICY "Users can view own profile" ON "users"
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON "users"
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
