const mongoose = require('mongoose');

const BinSchema = new mongoose.Schema({
  binId: {
    type: String,
    required: true,
    unique: true,
  },
  // Location stored in GeoJSON format
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  capacity: {
    type: Number,
    required: true,
    default: 10, // Default capacity in items
  },
  totalItems: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['collecting', 'full', 'servicing'],
    default: 'collecting',
  },
  wasteCounts: {
    type: Map,
    of: Number,
    default: {},
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

// Add a 2dsphere index for geospatial queries, which is essential for finding nearby bins
BinSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Bin', BinSchema);