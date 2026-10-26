// routes/Auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User } = require('../models');
const { revokeToken, isTokenRevoked, JWT_SECRET } = require('../middlewares/AuthMiddleware');

const BCRYPT_ROUNDS = 12;
// Compute a valid 60-character 12-round bcrypt hash at startup to mitigate timing enumeration attacks
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'provi_prints_dummy_timing_mitigation_secret',
  BCRYPT_ROUNDS
);

const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  // Default to 'none' in production so cross-domain (.pages.dev <-> .run.app) cookies work over HTTPS;
  // set COOKIE_SAMESITE=strict once both frontend and API share the same root custom domain.
  const sameSite = process.env.COOKIE_SAMESITE || (isProd ? 'none' : 'strict');
  const isCrossSite = sameSite === 'none';
  return {
    httpOnly: true,
    secure: isProd || isCrossSite,
    sameSite,
    ...(isCrossSite ? { partitioned: true } : {}),
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    path: '/',
  };
};

const getCookieName = (req) =>
  req.headers['x-portal'] === 'admin' ? 'adminAccessToken' : 'accessToken';

// Secure Registration Route
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (
    typeof username !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    return res.status(400).json({ error: "Username, email, and password must be valid strings" });
  }

  const trimmedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (!trimmedUsername || !normalizedEmail || !password) {
    return res.status(400).json({ error: "Username, email, and password are required" });
  }

  const usernameRegex = /^[a-zA-Z0-9_.-]{3,30}$/;
  if (!usernameRegex.test(trimmedUsername)) {
    return res.status(400).json({
      error: "Username must be 3-30 characters and contain only letters, numbers, underscores, dots, or hyphens"
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (normalizedEmail.length > 254 || !emailRegex.test(normalizedEmail)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // Bcrypt truncates passwords longer than 72 UTF-8 bytes
  const passwordByteLength = Buffer.byteLength(password, 'utf8');
  if (password.length < 8 || passwordByteLength > 72) {
    return res.status(400).json({ error: "Password must be between 8 characters and 72 bytes" });
  }

  try {
    // Check if either the email OR the username is already taken
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email: normalizedEmail }, { username: trimmedUsername }]
      }
    });

    if (existingUser) {
      return res.status(409).json({ error: "Email or username already registered" });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Creates the user (role defaults to 'customer' automatically)
    await User.create({
      username: trimmedUsername,
      email: normalizedEmail,
      password_hash
    });

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Server error during registration" });
  }
});

// Secure Login Route
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body; // 'identifier' is either their username or email

  if (typeof identifier !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: "Username/Email and password are required" });
  }

  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier || !password) {
    return res.status(400).json({ error: "Username/Email and password are required" });
  }

  // Prevent DoS with oversized password inputs before running bcrypt.compare
  if (Buffer.byteLength(password, 'utf8') > 1024) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  try {
    // Find user by either normalized email OR exact username
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: trimmedIdentifier.toLowerCase() },
          { username: trimmedIdentifier }
        ]
      }
    });

    // Always run bcrypt.compare against a valid 12-round hash to prevent timing attacks
    const targetHash = user ? user.password_hash : DUMMY_PASSWORD_HASH;
    const match = await bcrypt.compare(password, targetHash);

    if (!user || !match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isAdminPortal = req.headers['x-portal'] === 'admin';
    if (isAdminPortal && user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied: Admins only." });
    }

    // Include the role and username in the JWT payload
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    const cookieName = getCookieName(req);
    res.cookie(cookieName, accessToken, {
      ...getCookieOptions(),
      maxAge: 3600000, // 1 hour
    });

    res.json({
      message: "Logged in successfully",
      username: user.username,
      role: user.role
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error during login" });
  }
});

// Verify Active Session Route (returns 200 with null user when unauthenticated to avoid browser console 401 noise)
router.get('/me', async (req, res) => {
  const cookieName = getCookieName(req);
  const accessToken = req.cookies?.[cookieName];

  if (!accessToken || isTokenRevoked(accessToken)) {
    return res.json({ authenticated: false, id: null, username: null, role: null });
  }

  try {
    const validToken = jwt.verify(accessToken, JWT_SECRET, {
      algorithms: ['HS256'],
    });

    // Query the database so revoked/deleted users or changed roles take effect immediately
    const user = await User.findByPk(validToken.id, {
      attributes: ['id', 'username', 'role']
    });

    if (!user) {
      res.clearCookie(cookieName, getCookieOptions());
      return res.json({ authenticated: false, id: null, username: null, role: null });
    }

    if (req.headers['x-portal'] === 'admin' && user.role !== 'admin') {
      res.clearCookie(cookieName, getCookieOptions());
      return res.json({ authenticated: false, id: null, username: null, role: null });
    }

    res.json({
      authenticated: true,
      id: user.id,
      username: user.username,
      role: user.role
    });
  } catch (error) {
    res.clearCookie(cookieName, getCookieOptions());
    return res.json({ authenticated: false, id: null, username: null, role: null });
  }
});

// Logout Route
router.post('/logout', (req, res) => {
  const cookieName = getCookieName(req);
  const token = req.cookies?.[cookieName];
  if (token) {
    revokeToken(token);
  }
  res.clearCookie(cookieName, getCookieOptions());
  res.json({ message: "Logged out successfully" });
});

module.exports = router;
