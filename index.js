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

    // Get All Books (Latest First)
    app.get('/books', async (req, res) => {
      try {
        const limit = Number(req.query.limit) || 0;

        let query = db.collection('books').find().sort({ createdAt: -1 });

        if (limit > 0) {
          query = query.limit(limit);
        }

        const books = await query.toArray();

        res.status(200).send(books);
      } catch (error) {
        console.error('Get Books Error:', error);

        res.status(500).send({
          message: 'Failed to get books',
        });
      }
    });

    // Get Single Book
    app.get('/books/:id', async (req, res) => {
      try {
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

        res.status(200).send(book);
      } catch (error) {
        console.error('Get Single Book Error:', error);

        res.status(500).send({
          message: 'Failed to get book',
        });
      }
    });

    // Add New Book
    app.post('/books', async (req, res) => {
      try {
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
        console.error('Add Book Error:', error);

        res.status(500).send({
          message: 'Failed to add book',
        });
      }
    });

    // Update Book
    app.patch('/books/:id', async (req, res) => {
      try {
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
        console.error('Update Book Error:', error);

        res.status(500).send({
          message: 'Failed to update book',
        });
      }
    });

    // Delete Book
    app.delete('/books/:id', async (req, res) => {
      try {
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
        console.error('Delete Book Error:', error);

        res.status(500).send({
          message: 'Failed to delete book',
        });
      }
    });

    // Borrow a Book
    app.post('/borrows', async (req, res) => {
      try {
        const { bookId, userEmail, borrowDate, returnDate } = req.body;

        // Validate required fields
        if (!bookId || !userEmail || !borrowDate || !returnDate) {
          return res.status(400).send({
            message: 'All required fields must be provided',
          });
        }

        if (!ObjectId.isValid(bookId)) {
          return res.status(400).send({
            message: 'Invalid Book ID',
          });
        }

        // Check existing borrow
        const existingBorrow = await db.collection('borrows').findOne({
          bookId,
          userEmail,
        });

        if (existingBorrow) {
          return res.status(409).send({
            message: 'You have already borrowed this book',
          });
        }

        // Find book
        const book = await db.collection('books').findOne({
          _id: new ObjectId(bookId),
        });

        if (!book) {
          return res.status(404).send({
            message: 'Book not found',
          });
        }

        // Decrease available copies
        const bookUpdate = await db.collection('books').updateOne(
          {
            _id: new ObjectId(bookId),
            totalCopies: { $gt: 0 },
          },
          {
            $inc: { totalCopies: -1 },
          },
        );

        if (bookUpdate.modifiedCount === 0) {
          return res.status(409).send({
            message: 'Book is not available',
          });
        }

        // Create borrow record
        const newBorrow = {
          bookId,
          bookTitle: book.title,
          bookImage: book.image,
          userEmail,
          borrowDate,
          returnDate,
        };

        try {
          const result = await db.collection('borrows').insertOne(newBorrow);

          res.status(201).send({
            message: 'Book borrowed successfully!',
            insertedId: result.insertedId,
          });
        } catch (error) {
          // Restore copy if borrow record fails
          await db
            .collection('books')
            .updateOne(
              { _id: new ObjectId(bookId) },
              { $inc: { totalCopies: 1 } },
            );

          throw error;
        }
      } catch (error) {
        console.error('Borrow Book Error:', error);

        res.status(500).send({
          message: 'Failed to borrow book',
        });
      }
    });

    // Get User's Borrowed Books
    app.get('/borrows', async (req, res) => {
      try {
        const userEmail = req.query.email;

        if (!userEmail) {
          return res.status(400).send({
            message: 'User email is required',
          });
        }

        const borrows = await db
          .collection('borrows')
          .find({ userEmail })
          .toArray();

        res.status(200).send(borrows);
      } catch (error) {
        console.error('Get Borrows Error:', error);

        res.status(500).send({
          message: 'Failed to get borrowed books',
        });
      }
    });

    // Return a Borrowed Book
    app.delete('/borrows/:id', async (req, res) => {
      try {
        const borrowId = req.params.id;

        if (!ObjectId.isValid(borrowId)) {
          return res.status(400).send({
            message: 'Invalid Borrow ID',
          });
        }

        const borrow = await db.collection('borrows').findOne({
          _id: new ObjectId(borrowId),
        });

        if (!borrow) {
          return res.status(404).send({
            message: 'Borrow record not found',
          });
        }

        if (!ObjectId.isValid(borrow.bookId)) {
          return res.status(400).send({
            message: 'Invalid Book ID',
          });
        }

        const bookUpdate = await db
          .collection('books')
          .updateOne(
            { _id: new ObjectId(borrow.bookId) },
            { $inc: { totalCopies: 1 } },
          );

        if (bookUpdate.matchedCount === 0) {
          return res.status(404).send({
            message: 'Book not found',
          });
        }

        await db.collection('borrows').deleteOne({
          _id: new ObjectId(borrowId),
        });

        res.send({
          message: 'Book returned successfully!',
        });
      } catch (error) {
        console.error('Return Book Error:', error);

        res.status(500).send({
          message: 'Failed to return book',
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
