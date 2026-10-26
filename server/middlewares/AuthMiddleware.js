const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("FATAL ERROR: JWT_SECRET environment variable is not defined.");
}

// In-memory store for revoked tokens (maps token string -> expiration timestamp in ms)
const revokedTokens = new Map();

const revokeToken = (token) => {
  if (!token || typeof token !== 'string') return;
  try {
    const decoded = jwt.decode(token);
    const expMs = decoded && decoded.exp ? decoded.exp * 1000 : Date.now() + 3600000;
    revokedTokens.set(token, expMs);
  } catch {
    revokedTokens.set(token, Date.now() + 3600000);
  }

  // Prune expired tokens opportunistically to bound memory usage
  const now = Date.now();
  for (const [key, expiresAt] of revokedTokens.entries()) {
    if (expiresAt <= now) {
      revokedTokens.delete(key);
    }
  }
};

const isTokenRevoked = (token) => {
  if (!token) return false;
  const expiresAt = revokedTokens.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    revokedTokens.delete(token);
    return false;
  }
  return true;
};

const getTokenFromRequest = (req) => {
  const isAdminPortal = req.headers['x-portal'] === 'admin';
  if (isAdminPortal) {
    return req.cookies?.adminAccessToken;
  }
  if (req.baseUrl === '/auth') {
    return req.cookies?.accessToken;
  }
  return req.cookies?.adminAccessToken || req.cookies?.accessToken;
};

const validateToken = async (req, res, next) => {
  const accessToken = getTokenFromRequest(req);

  if (!accessToken || isTokenRevoked(accessToken)) {
    return res.status(401).json({ error: "User not logged in" });
  }

  try {
    const validToken = jwt.verify(accessToken, JWT_SECRET, {
      algorithms: ['HS256'],
    });

    // Query the database so deleted users or changed roles take effect immediately
    const user = await User.findByPk(validToken.id, {
      attributes: ['id', 'username', 'role'],
    });

    if (!user) {
      return res.status(401).json({ error: "Session no longer valid" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    req.accessToken = accessToken;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const isAdmin = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "User not logged in" });
  }

  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'role'],
    });

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied: Admins only" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    next();
  } catch (err) {
    console.error("Admin authorization error:", err);
    return res.status(500).json({ error: "Server error verifying permissions" });
  }
};

module.exports = { validateToken, isAdmin, revokeToken, isTokenRevoked, JWT_SECRET };
