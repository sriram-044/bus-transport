
// Navbar mobile toggle
document.querySelector(".menu-icon").addEventListener("click", () => {
  document.querySelector(".nav-links").classList.toggle("show");
});
document.querySelector(".menu-icon").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    document.querySelector(".nav-links").classList.toggle("show");
  }
});

// Smooth scroll for navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", function(e) {
    e.preventDefault();
    const targetId = this.getAttribute("href");
    const target = document.querySelector(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  });
});

// Contact form submission
const feedbackForm = document.getElementById("feedbackForm");
if (feedbackForm) {
  feedbackForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const message = document.getElementById("message").value.trim();
    const rating = document.getElementById("rating").value;
    if (name && email) {
      try {
        const response = await fetch('http://localhost:5000/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, message, rating })
        });
        const data = await response.json();
        if (response.ok) {
          alert(data.message);
          feedbackForm.reset();
        } else {
          alert(data.error || 'Failed to submit feedback');
        }
      } catch (error) {
        alert('Error submitting feedback');
      }
    }
  });
}

// Booking form submission
const bookingForm = document.getElementById("bookingForm");
if (bookingForm) {
  let selectedSeat = null;
  let selectedBusId = null;
  let bookedSeats = [];

  // Load routes on page load
  loadRoutes();

  async function loadRoutes() {
    try {
      const response = await fetch('http://localhost:5000/api/routes');
      const routes = await response.json();
      const routeSelect = document.getElementById('route');
      
      // Create a Set to track unique route combinations
      const addedRoutes = new Set();
      
      for (const route of routes) {
        const routeKey = `${route.from_city}-${route.to_city}`;
        
        // Skip if already added
        if (addedRoutes.has(routeKey)) {
          continue;
        }
        
        // Check if this route has buses
        const busResponse = await fetch(`http://localhost:5000/api/buses/route/${route.id}`);
        const buses = await busResponse.json();
        
        // Only add routes that have buses
        if (buses.length > 0) {
          const option = document.createElement('option');
          option.value = route.id;
          option.textContent = `${route.from_city} → ${route.to_city}`;
          routeSelect.appendChild(option);
          addedRoutes.add(routeKey);
        }
      }
    } catch (error) {
      console.error('Error loading routes:', error);
    }
  }

  // When route is selected, load available buses
  document.getElementById('route').addEventListener('change', async function(e) {
    const routeId = e.target.value;
    const busSelect = document.getElementById('bus');
    busSelect.innerHTML = '<option value="">-- Select Bus --</option>';
    busSelect.disabled = true;
    document.getElementById('seatSelectionContainer').style.display = 'none';
    document.getElementById('busInfo').style.display = 'none';
    document.getElementById('bookBtn').disabled = true;

    if (!routeId) return;

    try {
      const response = await fetch(`http://localhost:5000/api/buses/route/${routeId}`);
      const buses = await response.json();
      
      buses.forEach(bus => {
        const option = document.createElement('option');
        option.value = bus.id;
        option.textContent = `${bus.bus_number} - Departs at ${bus.departure_time}`;
        busSelect.appendChild(option);
      });
      
      busSelect.disabled = false;
    } catch (error) {
      console.error('Error loading buses:', error);
      alert('Failed to load buses');
    }
  });

  // When bus is selected, show seat layout
  document.getElementById('bus').addEventListener('change', async function(e) {
    selectedBusId = e.target.value;
    if (!selectedBusId) return;

    try {
      const response = await fetch(`http://localhost:5000/api/buses/${selectedBusId}/availability`);
      const data = await response.json();
      
      document.getElementById('totalSeats').textContent = data.total_seats;
      document.getElementById('availableSeats').textContent = data.available_seats;
      document.getElementById('busInfo').style.display = 'block';

      // Fetch booked seats
      const bookedResponse = await fetch(`http://localhost:5000/api/buses/${selectedBusId}/booked-seats`);
      bookedSeats = await bookedResponse.json();

      renderSeatLayout(data.total_seats, bookedSeats);
      document.getElementById('seatSelectionContainer').style.display = 'block';
    } catch (error) {
      console.error('Error loading seat info:', error);
      alert('Failed to load seat information');
    }
  });

  function renderSeatLayout(totalSeats, booked) {
    const seatLayout = document.getElementById('seatLayout');
    seatLayout.innerHTML = '';
    
    for (let i = 1; i <= totalSeats; i++) {
      // Add aisle space after every 4 seats (2x2 layout)
      if (i % 4 === 3) {
        const aisle = document.createElement('div');
        aisle.className = 'seat aisle';
        seatLayout.appendChild(aisle);
      }

      const seat = document.createElement('div');
      seat.className = 'seat';
      seat.textContent = i;
      seat.dataset.seatNumber = i;

      if (booked.includes(i)) {
        seat.classList.add('booked');
      } else {
        seat.addEventListener('click', function() {
          selectSeat(this);
        });
      }

      seatLayout.appendChild(seat);
    }
  }

  function selectSeat(seatElement) {
    // Remove previous selection
    document.querySelectorAll('.seat.selected').forEach(s => s.classList.remove('selected'));
    
    // Select new seat
    seatElement.classList.add('selected');
    selectedSeat = parseInt(seatElement.dataset.seatNumber);
    document.getElementById('selectedSeatNumber').textContent = selectedSeat;
    document.getElementById('bookBtn').disabled = false;
  }

  bookingForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    
    if (!selectedSeat) {
      alert('Please select a seat!');
      return;
    }

    const formData = {
      userId: null, // Guest booking
      busId: parseInt(selectedBusId),
      seatNumber: selectedSeat
    };

    try {
      const response = await fetch('http://localhost:5000/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      if (response.ok) {
        alert(`Booking Confirmed!

PNR: ${data.pnr}
Seat Number: ${selectedSeat}
Bus: ${document.getElementById('bus').selectedOptions[0].text}`);
        // Reload seat layout to show the newly booked seat
        document.getElementById('bus').dispatchEvent(new Event('change'));
        selectedSeat = null;
        document.getElementById('selectedSeatNumber').textContent = 'None';
        document.getElementById('bookBtn').disabled = true;
      } else {
        alert(data.error || 'Failed to book ticket');
      }
    } catch (error) {
      console.error('Booking error:', error);
      alert('Error booking ticket');
    }
  });
}

// Login form submission
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        window.location.href = "profile.html";
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (error) {
      alert('Error during login');
    }
  });
}

// PNR form submission
const pnrForm = document.getElementById("pnrForm");
if (pnrForm) {
  pnrForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const pnr = document.getElementById("pnrInput").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(pnr)) {
      alert("Invalid PNR format! Must be 10 alphanumeric characters.");
      return;
    }
    try {
      const response = await fetch(`http://localhost:5000/api/pnr/${pnr}`);
      const data = await response.json();
      const resultBox = document.getElementById("pnrResult");
      if (response.ok) {
        document.getElementById("pnrDisplay").textContent = data.pnr;
        document.getElementById("nameDisplay").textContent = data.name;
        document.getElementById("routeDisplay").textContent = data.route;
        document.getElementById("busNumberDisplay").textContent = data.busNumber;
        document.getElementById("seatNumberDisplay").textContent = data.seatNumber;
        document.getElementById("departureDateDisplay").textContent = new Date(data.departureDate).toLocaleDateString();
        document.getElementById("departureTimeDisplay").textContent = data.departureTime;
        document.getElementById("fareDisplay").textContent = data.fare || 'N/A';
        
        const statusBadge = document.getElementById("statusDisplay");
        statusBadge.textContent = data.status.toUpperCase();
        statusBadge.className = 'status-badge status-' + data.status.toLowerCase();
        
        document.getElementById("bookingDateDisplay").textContent = new Date(data.bookingDate).toLocaleString();
        resultBox.style.display = "block";
      } else {
        alert(data.error || 'PNR not found');
        resultBox.style.display = "none";
      }
    } catch (error) {
      alert('Error checking PNR status');
      document.getElementById("pnrResult").style.display = "none";
    }
  });
}
