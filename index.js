const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient } = require('mongodb');

const app = express();

const PORT = process.env.PORT || 5000;
const client = new MongoClient(process.env.MONGODB_URI);

// Middleware
app.use(cors());
app.use(express.json());

// Test Route
app.get('/', (req, res) => {
  res.send('BookNook Server is Running!');
});

// Connect MongoDB
async function connectDB() {
  try {
    await client.connect();

    console.log('MongoDB Connected Successfully!');

    const db = client.db(process.env.DB_NAME);

    app.locals.db = db;

    app.listen(PORT, () => {
      console.log(`BookNook Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB Connection Failed:', error);
  }
}

connectDB();
