const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const app = express();

const PORT = process.env.PORT || 5000;
const AUTH_URL = process.env.AUTH_URL || 'http://localhost:3000';

const client = new MongoClient(process.env.MONGODB_URI);

const JWKS = createRemoteJWKSet(new URL(`${AUTH_URL}/api/auth/jwks`));

// Middleware
app.use(cors());
app.use(express.json());

// Verify JWT Middleware
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send({
        message: 'Unauthorized access',
      });
    }

    const token = authHeader.split(' ')[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });

    if (!payload.email) {
      return res.status(401).send({
        message: 'User email not found in token',
      });
    }

    req.user = payload;

    next();
  } catch (error) {
    console.error('JWT Verification Error:', error.message);

    return res.status(401).send({
      message: 'Invalid or expired token',
    });
  }
};

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

    const booksCollection = db.collection('books');
    const borrowsCollection = db.collection('borrows');

    // Prevent duplicate borrow records
    await borrowsCollection.createIndex(
      { bookId: 1, userEmail: 1 },
      { unique: true },
    );

    // GET All Books (Latest First)
    app.get('/books', async (req, res) => {
      try {
        const limit = Number(req.query.limit) || 0;

        let query = booksCollection.find().sort({ createdAt: -1 });

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

    // GET Single Book
    app.get('/books/:id', async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: 'Invalid Book ID',
          });
        }

        const book = await booksCollection.findOne({
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

    // POST Add New Book
    app.post('/books', verifyToken, async (req, res) => {
      try {
        const newBook = {
          ...req.body,
          userName: req.user.name || '',
          userEmail: req.user.email,
          addedDate:
            req.body.addedDate || new Date().toISOString().split('T')[0],
          createdAt: new Date(),
        };

        const result = await booksCollection.insertOne(newBook);

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

    // PATCH Update Book
    app.patch('/books/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: 'Invalid Book ID',
          });
        }

        const allowedFields = [
          'title',
          'author',
          'category',
          'image',
          'description',
          'totalCopies',
        ];

        const updateData = {};

        allowedFields.forEach(field => {
          if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
          }
        });

        const updatedBook = await booksCollection.updateOne(
          {
            _id: new ObjectId(id),
            userEmail: req.user.email,
          },
          {
            $set: updateData,
          },
        );

        if (updatedBook.matchedCount === 0) {
          return res.status(404).send({
            message: 'Book not found or you are not the owner',
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

    // DELETE Book
    app.delete('/books/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: 'Invalid Book ID',
          });
        }

        const result = await booksCollection.deleteOne({
          _id: new ObjectId(id),
          userEmail: req.user.email,
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            message: 'Book not found or you are not the owner',
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

    // POST Borrow a Book
    app.post('/borrows', verifyToken, async (req, res) => {
      let bookId;

      try {
        const { borrowDate, returnDate } = req.body;

        bookId = req.body.bookId;

        if (!bookId || !borrowDate || !returnDate) {
          return res.status(400).send({
            message: 'All required fields must be provided',
          });
        }

        if (!ObjectId.isValid(bookId)) {
          return res.status(400).send({
            message: 'Invalid Book ID',
          });
        }

        const userEmail = req.user.email;

        // Check existing borrow
        const existingBorrow = await borrowsCollection.findOne({
          bookId,
          userEmail,
        });

        if (existingBorrow) {
          return res.status(409).send({
            message: 'You have already borrowed this book',
          });
        }

        // Find Book
        const book = await booksCollection.findOne({
          _id: new ObjectId(bookId),
        });

        if (!book) {
          return res.status(404).send({
            message: 'Book not found',
          });
        }

        // Decrease Available Copies
        const bookUpdate = await booksCollection.updateOne(
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

        // Create Borrow Record
        const newBorrow = {
          bookId,
          bookTitle: book.title,
          bookImage: book.image,
          userName: req.user.name || '',
          userEmail,
          borrowDate,
          returnDate,
        };

        try {
          const result = await borrowsCollection.insertOne(newBorrow);

          res.status(201).send({
            message: 'Book borrowed successfully!',
            insertedId: result.insertedId,
          });
        } catch (error) {
          // Restore copy if borrow record fails
          await booksCollection.updateOne(
            { _id: new ObjectId(bookId) },
            { $inc: { totalCopies: 1 } },
          );

          if (error.code === 11000) {
            return res.status(409).send({
              message: 'You have already borrowed this book',
            });
          }

          throw error;
        }
      } catch (error) {
        console.error('Borrow Book Error:', error);

        res.status(500).send({
          message: 'Failed to borrow book',
        });
      }
    });

    // GET Logged-in User's Borrowed Books
    app.get('/borrows', verifyToken, async (req, res) => {
      try {
        const borrows = await borrowsCollection
          .find({ userEmail: req.user.email })
          .toArray();

        res.status(200).send(borrows);
      } catch (error) {
        console.error('Get Borrows Error:', error);

        res.status(500).send({
          message: 'Failed to get borrowed books',
        });
      }
    });

    // DELETE Return a Borrowed Book
    app.delete('/borrows/:id', verifyToken, async (req, res) => {
      try {
        const borrowId = req.params.id;

        if (!ObjectId.isValid(borrowId)) {
          return res.status(400).send({
            message: 'Invalid Borrow ID',
          });
        }

        // Find only the logged-in user's borrow record
        const borrow = await borrowsCollection.findOne({
          _id: new ObjectId(borrowId),
          userEmail: req.user.email,
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

        // Check whether the book exists before deleting the borrow
        const book = await booksCollection.findOne({
          _id: new ObjectId(borrow.bookId),
        });

        if (!book) {
          return res.status(404).send({
            message: 'Book not found. Borrow record was not deleted.',
          });
        }

        // Delete borrow record
        const deleteResult = await borrowsCollection.deleteOne({
          _id: new ObjectId(borrowId),
          userEmail: req.user.email,
        });

        if (deleteResult.deletedCount === 0) {
          return res.status(404).send({
            message: 'Borrow record not found',
          });
        }

        // Restore Available Copy
        await booksCollection.updateOne(
          { _id: new ObjectId(borrow.bookId) },
          { $inc: { totalCopies: 1 } },
        );

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
