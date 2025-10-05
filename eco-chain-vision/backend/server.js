const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

const Bin = require('./models/bin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity in this prototype
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const MONGO_URI = 'mongodb://localhost:27017/wastenet';
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    seedDatabase(); // Seed the database with initial data
  })
  .catch(err => console.error('Could not connect to MongoDB', err));

// --- WebSocket Logic ---
io.on('connection', (socket) => {
  console.log('A user connected to WebSockets');
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// --- API Endpoints ---

// BE-3: Get all bin data
app.get('/api/bins', async (req, res) => {
  try {
    const bins = await Bin.find({});
    res.status(200).json(bins);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching bins', error });
  }
});

// BE-2: Log waste into a bin
app.post('/api/log', async (req, res) => {
  const { binId, wasteType } = req.body;

  if (!binId || !wasteType) {
    return res.status(400).json({ message: 'binId and wasteType are required' });
  }

  try {
    const bin = await Bin.findOne({ binId });
    if (!bin) {
      return res.status(404).json({ message: 'Bin not found' });
    }

    // Increment counts
    bin.totalItems += 1;
    bin.wasteCounts.set(wasteType, (bin.wasteCounts.get(wasteType) || 0) + 1);
    bin.lastUpdated = new Date();

    const oldStatus = bin.status;
    // Check if bin is full
    if (bin.totalItems >= bin.capacity) {
      bin.status = 'full';
    }

    const updatedBin = await bin.save();

    // If status changed, emit a WebSocket event
    if (oldStatus !== updatedBin.status) {
      io.emit('binStatusChange', updatedBin);
      console.log(`Status Change: Bin ${binId} is now ${updatedBin.status}`);
    }

    res.status(200).json(updatedBin);
  } catch (error) {
    res.status(500).json({ message: 'Error logging waste', error: error.message });
  }
});

// BE-4: Empty a bin
app.post('/api/bins/:binId/empty', async (req, res) => {
  const { binId } = req.params;

  try {
    const bin = await Bin.findOne({ binId });
    if (!bin) {
      return res.status(4404).json({ message: 'Bin not found' });
    }

    const oldStatus = bin.status;

    // Reset bin
    bin.totalItems = 0;
    bin.wasteCounts = new Map();
    bin.status = 'collecting';
    bin.lastUpdated = new Date();

    const updatedBin = await bin.save();

    // If status changed, emit a WebSocket event
    if (oldStatus !== updatedBin.status) {
      io.emit('binStatusChange', updatedBin);
      console.log(`Status Change: Bin ${binId} is now ${updatedBin.status}`);
    }

    res.status(200).json(updatedBin);
  } catch (error) {
    res.status(500).json({ message: 'Error emptying bin', error });
  }
});

// --- Database Seeding ---
async function seedDatabase() {
  try {
    const count = await Bin.countDocuments();
    if (count > 0) {
      console.log('Bin data already exists. Skipping seed.');
      return;
    }

    const bins = [
      {
        binId: 'BIN-001',
        location: { type: 'Point', coordinates: [-74.0060, 40.7128] }, // NYC
        capacity: 100,
        wasteCounts: new Map([['plastic', 10], ['paper', 20]]),
        totalItems: 30,
      },
      {
        binId: 'BIN-002',
        location: { type: 'Point', coordinates: [-118.2437, 34.0522] }, // Los Angeles
        capacity: 120,
        status: 'full',
        wasteCounts: new Map([['organic', 80], ['plastic', 40]]),
        totalItems: 120,
      },
      {
        binId: 'BIN-003',
        location: { type: 'Point', coordinates: [-87.6298, 41.8781] }, // Chicago
        capacity: 100,
        wasteCounts: new Map([['paper', 55]]),
        totalItems: 55,
      },
    ];

    await Bin.insertMany(bins);
    console.log('Database seeded with initial bin data.');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}


server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});