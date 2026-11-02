const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

const PORT = process.env.PORT || 5000;
const client = new MongoClient(process.env.MONGODB_URI);

// Middleware
app.use(cors());
app.use(express.json());

// Home Route
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

    // Test Database Route
    app.get('/test-db', async (req, res) => {
      try {
        const db = req.app.locals.db;
        const collections = await db.listCollections().toArray();

        res.send({
          message: 'Database is working!',
          collections: collections.map(item => item.name),
        });
      } catch (error) {
        res.status(500).send({
          message: 'Database error',
        });
      }
    });

    // Get All Books
    app.get('/books', async (req, res) => {
      try {
        const db = req.app.locals.db;

        const books = await db
          .collection('books')
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.send(books);
      } catch (error) {
        res.status(500).send({
          message: 'Failed to get books',
        });
      }
    });

    // Get Single Book
    app.get('/books/:id', async (req, res) => {
      try {
        const db = req.app.locals.db;
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: 'Invalid Book ID',
          });
        }

        const book = await db.collection('books').findOne({
          _id: new ObjectId(id),
        });

        if (!book) {
          return res.status(404).send({
            message: 'Book not found',
          });
        }

        res.send(book);
      } catch (error) {
        res.status(500).send({
          message: 'Failed to get book',
        });
      }
    });

    // Update Book
    app.patch('/books/:id', async (req, res) => {
      try {
        const db = req.app.locals.db;
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: 'Invalid Book ID',
          });
        }

        const updatedBook = await db
          .collection('books')
          .updateOne({ _id: new ObjectId(id) }, { $set: req.body });

        if (updatedBook.matchedCount === 0) {
          return res.status(404).send({
            message: 'Book not found',
          });
        }

        res.send({
          message: 'Book updated successfully!',
          modifiedCount: updatedBook.modifiedCount,
        });
      } catch (error) {
        res.status(500).send({
          message: 'Failed to update book',
        });
      }
    });

    // Delete Book
    app.delete('/books/:id', async (req, res) => {
      try {
        const db = req.app.locals.db;
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: 'Invalid Book ID',
          });
        }

        const result = await db.collection('books').deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            message: 'Book not found',
          });
        }

        res.send({
          message: 'Book deleted successfully!',
        });
      } catch (error) {
        res.status(500).send({
          message: 'Failed to delete book',
        });
      }
    });

    // Add New Book
    app.post('/books', async (req, res) => {
      try {
        const db = req.app.locals.db;

        const newBook = {
          ...req.body,
          createdAt: new Date(),
        };

        const result = await db.collection('books').insertOne(newBook);

        res.status(201).send({
          message: 'Book added successfully!',
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({
          message: 'Failed to add book',
        });
      }
    });

    // Borrow a Book
    app.post('/borrows', async (req, res) => {
      try {
        const db = req.app.locals.db;

        const {
          bookId,
          bookTitle,
          bookImage,
          userEmail,
          borrowDate,
          returnDate,
        } = req.body;

        const newBorrow = {
          bookId,
          bookTitle,
          bookImage,
          userEmail,
          borrowDate,
          returnDate,
        };

        const result = await db.collection('borrows').insertOne(newBorrow);

        res.status(201).send({
          message: 'Book borrowed successfully!',
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({
          message: 'Failed to borrow book',
        });
      }
    });

    // Start Server
    app.listen(PORT, () => {
      console.log(`BookNook Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB Connection Failed:', error);
  }
}

connectDB();
