-- Add face_data column to employees table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS face_data TEXT;

-- Function to prevent updating face_data once it's set
CREATE OR REPLACE FUNCTION public.protect_face_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- If the old face_data was not null and the new one is different, prevent the change
    IF OLD.face_data IS NOT NULL AND NEW.face_data IS DISTINCT FROM OLD.face_data THEN
        RAISE EXCEPTION 'face_data cannot be changed once set';
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger to enforce the face_data protection
DROP TRIGGER IF EXISTS trigger_protect_face_data ON public.employees;
CREATE TRIGGER trigger_protect_face_data
BEFORE UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.protect_face_data();
