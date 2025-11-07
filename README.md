
🖥️ Front-End (User Interface)
- **Technology**: HTML, CSS, JavaScript (or React.js if preferred)
- **Pages**:
  - Login & Registration
  - Route Search
  - Bus Selection
  - Seat Booking (with real-time availability)
  - PNR Status & Cancellation
- **Features**:
  - Dynamic seat map (40 seats)
  - AJAX calls to backend APIs
  - Form validation and user feedback

 🗄️ Back-End (Server & Database)
- **Technology**: Node.js + Express.js
- **Database**: PostgreSQL
- **Key Functions**:
  - Handle user authentication (bcrypt encryption)
  - Manage bookings and cancellations
  - Fetch route and bus data
  - Generate unique PNRs
  - Store and retrieve feedback

 🔌 API Integration
- RESTful endpoints to connect front-end with database:
  - `POST /api/bookings` → Create booking
  - `GET /api/pnr/:pnr` → Check booking status
  - `PUT /api/bookings/:pnr/cancel` → Cancel booking
  - `GET /api/routes` → List routes
  - `GET /api/buses/:id/booked-seats` → Seat status


