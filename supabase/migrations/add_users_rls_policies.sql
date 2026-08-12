-- Enable RLS on users table (just in case)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile" 
ON public.users 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Allow users to view their own profile (or all profiles)
-- Usually public profiles are readable by everyone authenticated
CREATE POLICY "Users can view all profiles" 
ON public.users 
FOR SELECT 
USING (true);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id);
