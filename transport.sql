-- Create Tables
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(15),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routes (
  id SERIAL PRIMARY KEY,
  from_city VARCHAR(50) NOT NULL,
  to_city VARCHAR(50) NOT NULL,
  distance_km INT,
  duration_hours DECIMAL(4,2),
  fare DECIMAL(8,2)
);

CREATE TABLE IF NOT EXISTS buses (
  id SERIAL PRIMARY KEY,
  route_id INT REFERENCES routes(id) ON DELETE CASCADE,
  bus_number VARCHAR(20) UNIQUE NOT NULL,
  total_seats INT DEFAULT 40,
  departure_time TIME,
  departure_date DATE
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  bus_id INT REFERENCES buses(id) ON DELETE CASCADE,
  seat_number INT,
  pnr VARCHAR(10) UNIQUE,
  booking_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'confirmed'
);

CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  comments TEXT,
  submitted_at TIMESTAMP DEFAULT NOW()
);

-- Insert Tamil Nadu Routes
INSERT INTO routes (from_city, to_city, distance_km, duration_hours, fare)
VALUES
  ('Chennai', 'Madurai', 460, 8.5, 650.00),
  ('Chennai', 'Coimbatore', 500, 9.0, 700.00),
  ('Chennai', 'Ooty', 560, 10.5, 850.00),
  ('Chennai', 'Trichy', 330, 6.0, 450.00),
  ('Madurai', 'Chennai', 460, 8.5, 650.00)
ON CONFLICT DO NOTHING;

-- Insert sample buses (2-3 buses per route)
INSERT INTO buses (route_id, bus_number, total_seats, departure_time, departure_date)
VALUES
  (1, 'TN01-AB-1234', 40, '06:00', CURRENT_DATE),
  (1, 'TN01-AB-5678', 40, '10:00', CURRENT_DATE),
  (1, 'TN01-AB-9012', 40, '14:00', CURRENT_DATE),
  (2, 'TN02-CD-3456', 40, '07:00', CURRENT_DATE),
  (2, 'TN02-CD-7890', 40, '12:00', CURRENT_DATE),
  (3, 'TN03-EF-2345', 40, '08:00', CURRENT_DATE),
  (3, 'TN03-EF-6789', 40, '15:00', CURRENT_DATE),
  (4, 'TN04-GH-4567', 40, '09:00', CURRENT_DATE),
  (4, 'TN04-GH-8901', 40, '16:00', CURRENT_DATE),
  (5, 'TN05-IJ-5678', 40, '10:00', CURRENT_DATE),
  (5, 'TN05-IJ-9012', 40, '18:00', CURRENT_DATE)
ON CONFLICT (bus_number) DO NOTHING;

-- Add updated_at column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Trigger 1: Auto-update updated_at timestamp for users
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger 2: Validate seat availability before booking
CREATE OR REPLACE FUNCTION check_seat_availability()
RETURNS TRIGGER AS $$
DECLARE
    total_seats INT;
    booked_seats INT;
BEGIN
    -- Get total seats for the bus
    SELECT b.total_seats INTO total_seats
    FROM buses b
    WHERE b.id = NEW.bus_id;

    -- Count already booked seats
    SELECT COUNT(*) INTO booked_seats
    FROM bookings
    WHERE bus_id = NEW.bus_id AND status = 'confirmed';

    -- Check if seat is available
    IF booked_seats >= total_seats THEN
        RAISE EXCEPTION 'Bus is fully booked. No seats available.';
    END IF;

    -- Check if seat number is already taken
    IF EXISTS (SELECT 1 FROM bookings WHERE bus_id = NEW.bus_id AND seat_number = NEW.seat_number AND status = 'confirmed') THEN
        RAISE EXCEPTION 'Seat number % is already booked.', NEW.seat_number;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_booking_before_insert
BEFORE INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION check_seat_availability();

-- Trigger 3: Auto-generate PNR if not provided
CREATE OR REPLACE FUNCTION generate_pnr_if_null()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pnr IS NULL OR NEW.pnr = '' THEN
        NEW.pnr = 'TN' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(nextval('bookings_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_generate_pnr
BEFORE INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION generate_pnr_if_null();

-- Trigger 4: Prevent negative ratings in feedback
CREATE OR REPLACE FUNCTION validate_feedback_rating()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rating < 1 OR NEW.rating > 5 THEN
        RAISE EXCEPTION 'Rating must be between 1 and 5.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_feedback_rating
BEFORE INSERT OR UPDATE ON feedback
FOR EACH ROW
EXECUTE FUNCTION validate_feedback_rating();

-- Trigger 5: Log booking cancellations
CREATE TABLE IF NOT EXISTS booking_audit (
    id SERIAL PRIMARY KEY,
    booking_id INT,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    changed_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION log_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO booking_audit (booking_id, old_status, new_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_booking_status
AFTER UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION log_booking_status_change();
