const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test database connection
pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch(err => console.error("❌ Database connection error:", err));

// Generate random 10-character PNR
const generatePNR = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array(10).fill().map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
};

// Root endpoint
app.get("/", (req, res) => {
  res.send("🚍 Tamil Nadu Bus Transport Server is running successfully!");
});

// ---------------------------
// 🔹 API ENDPOINTS
// ---------------------------

// Register user
app.post('/api/register', async (req, res) => {
  const { name, email, password, phone } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, hashedPassword, phone || null]
    );
    res.status(201).json({ message: 'User registered successfully', userId: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// Login user
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ message: 'Login successful', userId: user.id, name: user.name });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Save booking
app.post('/api/bookings', async (req, res) => {
  const { userId, busId, seatNumber } = req.body;
  try {
    const pnr = generatePNR();
    const result = await pool.query(
      'INSERT INTO bookings (user_id, bus_id, seat_number, pnr, status) VALUES ($1, $2, $3, $4, $5) RETURNING pnr',
      [userId || null, busId, seatNumber, pnr, 'confirmed']
    );
    res.json({ message: 'Booking confirmed', pnr: result.rows[0].pnr });
  } catch (error) {
    // Handle trigger errors
    if (error.message && error.message.includes('fully booked')) {
      res.status(400).json({ error: 'Bus is fully booked. Please choose another bus.' });
    } else if (error.message && error.message.includes('already booked')) {
      res.status(400).json({ error: error.message });
    } else if (error.code === '23505') {
      res.status(500).json({ error: 'Try again, booking failed' });
    } else {
      console.error('Booking error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// Get PNR status
app.get('/api/pnr/:pnr', async (req, res) => {
  const { pnr } = req.params;
  try {
    const result = await pool.query(
      `SELECT b.pnr, b.seat_number, b.status, b.booking_date,
              u.name, u.email, u.phone,
              bus.bus_number, bus.departure_time, bus.departure_date,
              r.from_city, r.to_city, r.fare
       FROM bookings b
       LEFT JOIN users u ON b.user_id = u.id
       JOIN buses bus ON b.bus_id = bus.id
       JOIN routes r ON bus.route_id = r.id
       WHERE b.pnr = $1`,
      [pnr]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'PNR not found' });
    }
    const booking = result.rows[0];
    res.json({
      pnr: booking.pnr,
      name: booking.name || 'Guest',
      email: booking.email || 'N/A',
      phone: booking.phone || 'N/A',
      route: `${booking.from_city} → ${booking.to_city}`,
      busNumber: booking.bus_number,
      seatNumber: booking.seat_number,
      departureDate: booking.departure_date,
      departureTime: booking.departure_time,
      fare: booking.fare,
      status: booking.status,
      bookingDate: booking.booking_date
    });
  } catch (error) {
    console.error('PNR lookup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save feedback
app.post('/api/feedback', async (req, res) => {
  const { userId, rating, comments } = req.body;
  try {
    await pool.query(
      'INSERT INTO feedback (user_id, rating, comments) VALUES ($1, $2, $3)',
      [userId || null, rating, comments]
    );
    res.json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all routes
app.get('/api/routes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM routes ORDER BY from_city, to_city');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get buses by route
app.get('/api/buses/route/:routeId', async (req, res) => {
  const { routeId } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM buses WHERE route_id = $1 ORDER BY departure_date, departure_time',
      [routeId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Check seat availability for a bus
app.get('/api/buses/:busId/availability', async (req, res) => {
  const { busId } = req.params;
  try {
    const result = await pool.query(
      `SELECT b.total_seats,
              COUNT(bk.id) FILTER (WHERE bk.status = 'confirmed') as booked_seats,
              b.total_seats - COUNT(bk.id) FILTER (WHERE bk.status = 'confirmed') as available_seats
       FROM buses b
       LEFT JOIN bookings bk ON b.id = bk.bus_id
       WHERE b.id = $1
       GROUP BY b.id, b.total_seats`,
      [busId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bus not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get booked seat numbers for a bus
app.get('/api/buses/:busId/booked-seats', async (req, res) => {
  const { busId } = req.params;
  try {
    const result = await pool.query(
      "SELECT seat_number FROM bookings WHERE bus_id = $1 AND status = 'confirmed' ORDER BY seat_number",
      [busId]
    );
    const bookedSeats = result.rows.map(row => row.seat_number);
    res.json(bookedSeats);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel booking
app.put('/api/bookings/:pnr/cancel', async (req, res) => {
  const { pnr } = req.params;
  try {
    const result = await pool.query(
      "UPDATE bookings SET status = 'cancelled' WHERE pnr = $1 RETURNING *",
      [pnr]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ message: 'Booking cancelled successfully', booking: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------
// 🔹 Serve Frontend from "public"
// ---------------------------
app.use(express.static(path.join(__dirname, 'public')));

// For any route not handled by API, send index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------
// 🚀 Start Server
// ---------------------------
app.listen(port, () => {
  console.log(`🚍 Tamil Nadu Bus Transport Server is running successfully!`);
  console.log(`Server running at http://localhost:${port}`);
});
