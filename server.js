const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Serve Frontend Static Files (Taaki 'Cannot GET /' error na aaye)
app.use(express.static(__dirname));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/amazon_clone')
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// --- SCHEMAS & MODELS ---

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Product Schema
const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  imageUrl: { type: String, required: true },
  description: { type: String }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

// Order Schema (Fixed city to optional/default)
const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number
  }],
  totalAmount: { type: Number, required: true },
  shippingAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, default: 'Dehradun' },
    pincode: { type: String, required: true }
  },
  paymentMethod: { type: String, default: 'UPI' }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_jwt_key', (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// --- ROUTES ---

// Root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ name, email, password: hashedPassword });

    const token = jwt.sign(
      { id: newUser._id, email: newUser.email },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: newUser._id, name: newUser.name, email: newUser.email }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
});

// 2. Product Routes
app.get('/api/products', async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query = {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const products = await Product.find(query);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});

// Seed Dummy Products Route
app.get('/api/seed-products', async (req, res) => {
  try {
    await Product.deleteMany({});
    const dummyProducts = [
      {
        title: 'Apple MacBook Air M2',
        price: 99900,
        category: 'Laptops',
        imageUrl: 'https://via.placeholder.com/200?text=MacBook+Air',
        description: 'Apple M2 chip with 8-core CPU and 8-core GPU, 8GB Unified Memory, 256GB SSD storage.'
      },
      {
        title: 'iPhone 15 Pro (128 GB)',
        price: 129900,
        category: 'Mobiles',
        imageUrl: 'https://via.placeholder.com/200?text=iPhone+15+Pro',
        description: 'Titanium design, A17 Pro chip, 48MP Main camera, USB-C support.'
      },
      {
        title: 'ASUS TUF Gaming F15',
        price: 58990,
        category: 'Laptops',
        imageUrl: 'https://via.placeholder.com/200?text=ASUS+TUF',
        description: '15.6-inch FHD 144Hz, Intel Core i5-11400H, RTX 2050 4GB Graphics, 8GB RAM, 512GB SSD.'
      },
      {
        title: 'Samsung Galaxy S24 Ultra',
        price: 129999,
        category: 'Mobiles',
        imageUrl: 'https://via.placeholder.com/200?text=S24+Ultra',
        description: 'Galaxy AI, Snapdragon 8 Gen 3, 200MP Camera, Built-in S Pen.'
      }
    ];

    const createdProducts = await Product.insertMany(dummyProducts);
    res.json({ message: 'Database seeded successfully!', products: createdProducts });
  } catch (error) {
    res.status(500).json({ message: 'Error seeding products', error: error.message });
  }
});

// 3. Order Routes
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { items, totalAmount, paymentMethod, shippingAddress } = req.body;

    const newOrder = await Order.create({
      userId: req.user.id,
      items,
      totalAmount,
      paymentMethod,
      shippingAddress: shippingAddress || {}
    });

    res.status(201).json({ message: 'Order created successfully', order: newOrder });
  } catch (error) {
    res.status(500).json({ message: 'Error creating order', error: error.message });
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching orders', error: error.message });
  }
});

// Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});