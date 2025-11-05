import express from "express";
import cors from "cors";
import 'dotenv/config';
import session from "express-session";
import passport from "./config/passport.js"; // <-- Google OAuth config
import connectDB from "./config/db.js";
import i18next, { middleware } from "./config/i18n.js";

// Routes
import sessionsRoutes from "./routes/sessions.js";
import sandboxRoutes from "./routes/sandboxRoutes.js";
import authRoutes from "./routes/auth.js";
import googleAuthRoutes from "./routes/googleAuth.js"; // <-- New Google OAuth routes
import presentationRouter from "./routes/presentation.js";


const app = express();

// ========================
// 1. CONNECT DATABASE
// ========================
connectDB();

// ========================
// 2. MIDDLEWARE
// ========================
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://smart-agents.vercel.app',
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// presentation.js route
app.use("/api/presentation", presentationRouter);

// Express session (required for Passport)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Initialize i18n middleware
app.use(middleware.handle(i18next));

// Request logger (for debugging)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// ========================
// 3. ROUTES
// ========================
app.use("/api/auth", authRoutes);
app.use("/api/sessions", sessionsRoutes);
app.use("/api/sandbox", sandboxRoutes);
app.use("/auth", googleAuthRoutes); // <-- Google OAuth endpoints

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: req.t('api.welcome'),
    timestamp: new Date().toISOString(),
  });
});

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "✅ Nava AI API Server is running",
    version: "1.0.0",
  });
});

// ========================
// 4. ERROR HANDLING
// ========================
// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ========================
// 5. START SERVER
// ========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🚀 Server is running on port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔗 Client: ${process.env.CLIENT_URL || "http://localhost:5173"}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}\n`);
});
